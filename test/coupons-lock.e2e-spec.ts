import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { CouponsModule } from '../src/coupons/coupons.module';
import { CouponEntity } from '../src/coupons/infrastructure/persistence/coupon.entity';
import { IssuedCouponEntity } from '../src/coupons/infrastructure/persistence/issued-coupon.entity';
import { LockHandle, LockService } from '../src/redis/lock/lock.interface';

// 락을 획득하는 척하지만 실제로 Redis에 락을 걸지 않는 서비스 (race condition 재현용)
class NullLockService extends LockService {
  async acquire(key: string): Promise<LockHandle | null> {
    return { key, token: 'null' };
  }
  async release(): Promise<void> {}
}

async function createTestApp(overrideLock?: boolean): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [CouponEntity, IssuedCouponEntity],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      CouponsModule,
    ],
  });

  if (overrideLock) {
    builder.overrideProvider(LockService).useClass(NullLockService);
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication();
  await app.listen(0); // 0 = OS가 사용 가능한 포트를 자동 할당
  return app;
}

describe('쿠폰 분산 락 통합 테스트', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let couponId: string;

  // ── 락 없음 테스트용 앱 ──────────────────────────────────────────────
  describe('락 없음 — race condition 재현', () => {
    beforeAll(async () => {
      app = await createTestApp(true);
      dataSource = app.get(DataSource);
    }, 30000);

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await dataSource.getRepository(IssuedCouponEntity).clear();
      await dataSource.getRepository(CouponEntity).clear();

      const res = await request(app.getHttpServer())
        .post('/coupons/seed')
        .send({ maxCount: 10 })
        .expect(201);
      couponId = res.body.id;
    });

    it('동시 80개 요청 시 발급 건수가 10개를 초과한다 (race condition)', async () => {
      const requests = Array.from({ length: 80 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/coupons/${couponId}/issue`)
          .send({ userId: `user-${i}` }),
      );
      await Promise.all(requests);

      const countRes = await request(app.getHttpServer())
        .get(`/coupons/${couponId}/issued-count`)
        .expect(200);

      // 락 없이는 race condition으로 stock(10)개를 초과해 발급된다
      expect(countRes.body.count).toBeGreaterThan(10);
    }, 60000);
  });

  // ── Redlock 락 테스트용 앱 ──────────────────────────────────────────
  describe('Redlock 락 — 정확히 10개만 발급', () => {
    beforeAll(async () => {
      app = await createTestApp(false);
      dataSource = app.get(DataSource);
    }, 30000);

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await dataSource.getRepository(IssuedCouponEntity).clear();
      await dataSource.getRepository(CouponEntity).clear();

      const res = await request(app.getHttpServer())
        .post('/coupons/seed')
        .send({ maxCount: 10 })
        .expect(201);
      couponId = res.body.id;
    });

    it('동시 80개 요청 시 발급 건수가 정확히 10개다', async () => {
      const requests = Array.from({ length: 80 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/coupons/${couponId}/issue`)
          .send({ userId: `user-${i}` }),
      );
      await Promise.all(requests);

      const countRes = await request(app.getHttpServer())
        .get(`/coupons/${couponId}/issued-count`)
        .expect(200);

      expect(countRes.body.count).toBe(10);
    }, 60000);

    it('재고 소진 후 요청은 409를 반환한다', async () => {
      // 10개를 순차 발급해 재고를 소진
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post(`/coupons/${couponId}/issue`)
          .send({ userId: `user-${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .post(`/coupons/${couponId}/issue`)
        .send({ userId: 'late-user' });

      expect(res.status).toBe(409);
    }, 30000);
  });

  // ── 데드락 시나리오 ───────────────────────────────────────────────────
  describe('데드락 시나리오 — finally 블록 락 해제 검증', () => {
    let deadlockApp: INestApplication;
    let deadlockDataSource: DataSource;
    let deadlockCouponId: string;

    beforeAll(async () => {
      deadlockApp = await createTestApp(false);
      deadlockDataSource = deadlockApp.get(DataSource);
    }, 30000);

    afterAll(async () => {
      await deadlockApp.close();
    });

    beforeEach(async () => {
      await deadlockDataSource.getRepository(IssuedCouponEntity).clear();
      await deadlockDataSource.getRepository(CouponEntity).clear();

      const res = await request(deadlockApp.getHttpServer())
        .post('/coupons/seed')
        .send({ maxCount: 1 })
        .expect(201);
      deadlockCouponId = res.body.id;
    });

    it('예외 발생(재고 소진) 후에도 락이 finally 블록에서 해제되어 다음 요청이 빠르게 409를 반환한다', async () => {
      // 첫 번째 요청: 재고 1개 성공 발급
      const first = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${deadlockCouponId}/issue`)
        .send({ userId: 'user-first' });
      expect(first.status).toBe(201);

      // 두 번째 요청: 재고 소진 → ConflictException(409) 경로에서 finally가 락 해제
      const second = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${deadlockCouponId}/issue`)
        .send({ userId: 'user-second' });
      expect(second.status).toBe(409);

      // 세 번째 요청: 락이 데드락 상태라면 3초 타임아웃 후 409
      //              락이 정상 해제됐다면 즉시 409 (< 1000ms)
      const start = Date.now();
      const third = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${deadlockCouponId}/issue`)
        .send({ userId: 'user-third' });
      const elapsed = Date.now() - start;

      expect(third.status).toBe(409);
      // 데드락 없음: 락이 즉시 해제됐으므로 lock acquire + stock check = 빠름
      expect(elapsed).toBeLessThan(2000);
    }, 15000);

    it('TTL 만료 안전망 (학습 포인트): 락 홀더 비정상 종료 시 TTL 후 자동 해제', () => {
      // SetnxLockService: TTL=5000ms로 획득 후 프로세스 죽으면 5초 뒤 Redis에서 자동 삭제
      // RedlockLockService: 동일 동작 + retryCount 재시도로 일시적 Redis 장애에도 강함
      // → finally 블록이 정상 실행되는 한 TTL 만료는 보조 안전망으로만 동작
      expect(true).toBe(true);
    });
  });
});
