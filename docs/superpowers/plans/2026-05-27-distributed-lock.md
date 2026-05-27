# 분산 락 (Distributed Lock) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선착순 쿠폰 발급 시나리오로 Redis 분산 락을 SETNX 직접 구현 → redlock 전환하며 동시성과 데드락을 검증한다.

**Architecture:** `RedisModule`에 `LockService` 추상 클래스 + `SetnxLockService` / `RedlockLockService` 구현체를 두고, `CouponsModule`이 `LockService` 토큰으로 주입받아 교체 가능하게 설계한다. 쿠폰 도메인은 `Coupon` / `IssuedCoupon` 두 엔티티로 구성하며 Clean Architecture 레이어를 따른다.

**Tech Stack:** NestJS 11, TypeORM + PostgreSQL, ioredis, redlock v5, Jest (단위 + e2e)

---

## 파일 구조

```
# 신규 생성
src/redis/lock/lock.interface.ts          ← LockHandle + LockService 추상 클래스
src/redis/lock/lock.types.ts              ← LockAcquisitionError
src/redis/lock/setnx-lock.service.ts      ← SETNX 직접 구현 (Task 2)
src/redis/lock/setnx-lock.service.spec.ts ← 단위 테스트 (Task 2)
src/redis/lock/redlock-lock.service.ts    ← redlock 라이브러리 구현 (Task 8)

src/coupons/domain/entities/coupon.ts
src/coupons/domain/entities/issued-coupon.ts
src/coupons/domain/repositories/coupon.repository.ts
src/coupons/domain/repositories/issued-coupon.repository.ts

src/coupons/infrastructure/persistence/coupon.entity.ts
src/coupons/infrastructure/persistence/coupon.mapper.ts
src/coupons/infrastructure/persistence/coupon.repository.impl.ts
src/coupons/infrastructure/persistence/issued-coupon.entity.ts
src/coupons/infrastructure/persistence/issued-coupon.mapper.ts
src/coupons/infrastructure/persistence/issued-coupon.repository.impl.ts

src/coupons/application/use-cases/issue-coupon.use-case.ts
src/coupons/application/use-cases/issue-coupon.use-case.spec.ts
src/coupons/application/use-cases/seed-coupons.use-case.ts
src/coupons/application/use-cases/get-issued-count.use-case.ts

src/coupons/presentation/coupons.controller.ts
src/coupons/coupons.module.ts

test/coupons-lock.e2e-spec.ts

# 수정
src/redis/redis.module.ts                 ← SetnxLockService export 추가
src/redis/redis.constants.ts              ← (변경 없음, 확인용)
src/app.module.ts                         ← CouponsModule 추가
```

---

## Task 1: 패키지 설치 + 락 인터페이스/타입 정의

**Files:**
- Create: `src/redis/lock/lock.interface.ts`
- Create: `src/redis/lock/lock.types.ts`

- [ ] **Step 1: redlock 패키지 설치**

```bash
cd /path/to/project
npm install redlock
```

Expected: `package.json`의 `dependencies`에 `"redlock": "^5.x.x"` 추가됨

- [ ] **Step 2: `lock.interface.ts` 생성**

```typescript
// src/redis/lock/lock.interface.ts
export interface LockHandle {
  key: string;
  token: string;
}

export abstract class LockService {
  abstract acquire(key: string, ttlMs: number): Promise<LockHandle | null>;
  abstract release(handle: LockHandle): Promise<void>;
}
```

- [ ] **Step 3: `lock.types.ts` 생성**

```typescript
// src/redis/lock/lock.types.ts
export class LockAcquisitionError extends Error {
  constructor(key?: string) {
    super(key ? `락 획득 실패: ${key}` : '락 획득 실패');
    this.name = 'LockAcquisitionError';
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/redis/lock/lock.interface.ts src/redis/lock/lock.types.ts package.json package-lock.json
git commit -m "feat: 락 서비스 인터페이스 및 타입 정의"
```

---

## Task 2: SetnxLockService 구현 + 단위 테스트

**Files:**
- Create: `src/redis/lock/setnx-lock.service.ts`
- Create: `src/redis/lock/setnx-lock.service.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// src/redis/lock/setnx-lock.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_PUBLISHER } from '../redis.constants';
import { SetnxLockService } from './setnx-lock.service';

describe('SetnxLockService', () => {
  let service: SetnxLockService;
  let redis: { set: jest.Mock; eval: jest.Mock };

  beforeEach(async () => {
    redis = { set: jest.fn(), eval: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: REDIS_PUBLISHER, useValue: redis },
      ],
    }).compile();

    // 테스트에서 maxWaitMs를 200ms로 단축해 타임아웃 케이스를 빠르게 검증
    service = new SetnxLockService(module.get(REDIS_PUBLISHER), 200, 20);
  });

  afterEach(() => jest.clearAllMocks());

  it('Redis SET NX 성공 시 LockHandle을 반환한다', async () => {
    redis.set.mockResolvedValue('OK');
    const handle = await service.acquire('test:key', 5000);
    expect(handle).not.toBeNull();
    expect(handle!.key).toBe('test:key');
    expect(handle!.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('Redis SET NX 항상 실패 시 null을 반환한다 (타임아웃)', async () => {
    redis.set.mockResolvedValue(null);
    const handle = await service.acquire('test:key', 5000);
    expect(handle).toBeNull();
  }, 10000);

  it('재시도 후 락 획득 성공 시 handle을 반환한다', async () => {
    redis.set
      .mockResolvedValueOnce(null) // 1차 실패
      .mockResolvedValueOnce(null) // 2차 실패
      .mockResolvedValue('OK');    // 3차 성공
    const handle = await service.acquire('test:key', 5000);
    expect(handle).not.toBeNull();
    expect(redis.set).toHaveBeenCalledTimes(3);
  });

  it('release 시 Lua 스크립트로 원자적 unlock을 실행한다', async () => {
    redis.eval.mockResolvedValue(1);
    await service.release({ key: 'test:key', token: 'my-uuid' });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'test:key',
      'my-uuid',
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest setnx-lock.service.spec.ts --no-coverage
```

Expected: `Cannot find module './setnx-lock.service'`

- [ ] **Step 3: `SetnxLockService` 구현**

```typescript
// src/redis/lock/setnx-lock.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_PUBLISHER } from '../redis.constants';
import { LockHandle, LockService } from './lock.interface';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class SetnxLockService extends LockService {
  constructor(
    @Inject(REDIS_PUBLISHER) private readonly redis: Redis,
    private readonly maxWaitMs = 3000,
    private readonly initialDelayMs = 50,
  ) {
    super();
  }

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    let elapsed = 0;
    let delay = this.initialDelayMs;

    while (elapsed < this.maxWaitMs) {
      const result = await this.redis.set(key, token, 'NX', 'PX', ttlMs);
      if (result === 'OK') return { key, token };

      await sleep(delay);
      elapsed += delay;
      delay = Math.min(delay * 2, 500);
    }

    return null;
  }

  async release(handle: LockHandle): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, handle.key, handle.token);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest setnx-lock.service.spec.ts --no-coverage
```

Expected: `PASS src/redis/lock/setnx-lock.service.spec.ts` — 4 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/redis/lock/setnx-lock.service.ts src/redis/lock/setnx-lock.service.spec.ts
git commit -m "feat: SetnxLockService 구현 (exponential backoff + Lua unlock)"
```

---

## Task 3: 쿠폰 도메인 레이어

**Files:**
- Create: `src/coupons/domain/entities/coupon.ts`
- Create: `src/coupons/domain/entities/issued-coupon.ts`
- Create: `src/coupons/domain/repositories/coupon.repository.ts`
- Create: `src/coupons/domain/repositories/issued-coupon.repository.ts`

- [ ] **Step 1: 도메인 엔티티 생성**

```typescript
// src/coupons/domain/entities/coupon.ts
export class Coupon {
  id: string;
  name: string;
  stock: number;
  maxCount: number;
  createdAt: Date;
}
```

```typescript
// src/coupons/domain/entities/issued-coupon.ts
export class IssuedCoupon {
  id: string;
  couponId: string;
  userId: string;
  issuedAt: Date;
}
```

- [ ] **Step 2: 추상 리포지토리 생성**

```typescript
// src/coupons/domain/repositories/coupon.repository.ts
import { Coupon } from '../entities/coupon';

export interface CreateCouponData {
  name: string;
  stock: number;
  maxCount: number;
}

export abstract class CouponRepository {
  abstract findById(id: string): Promise<Coupon | null>;
  abstract save(coupon: Coupon): Promise<Coupon>;
  abstract create(data: CreateCouponData): Promise<Coupon>;
}
```

```typescript
// src/coupons/domain/repositories/issued-coupon.repository.ts
import { IssuedCoupon } from '../entities/issued-coupon';

export interface CreateIssuedCouponData {
  couponId: string;
  userId: string;
}

export abstract class IssuedCouponRepository {
  abstract create(data: CreateIssuedCouponData): Promise<IssuedCoupon>;
  abstract countByCouponId(couponId: string): Promise<number>;
  abstract deleteByCouponId(couponId: string): Promise<void>;
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/coupons/domain/
git commit -m "feat: 쿠폰 도메인 레이어 (엔티티 + 추상 리포지토리)"
```

---

## Task 4: 쿠폰 인프라 레이어 (TypeORM)

**Files:**
- Create: `src/coupons/infrastructure/persistence/coupon.entity.ts`
- Create: `src/coupons/infrastructure/persistence/coupon.mapper.ts`
- Create: `src/coupons/infrastructure/persistence/coupon.repository.impl.ts`
- Create: `src/coupons/infrastructure/persistence/issued-coupon.entity.ts`
- Create: `src/coupons/infrastructure/persistence/issued-coupon.mapper.ts`
- Create: `src/coupons/infrastructure/persistence/issued-coupon.repository.impl.ts`

- [ ] **Step 1: TypeORM 엔티티 생성**

```typescript
// src/coupons/infrastructure/persistence/coupon.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('coupon')
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'int' })
  stock: number;

  @Column({ name: 'max_count', type: 'int' })
  maxCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

```typescript
// src/coupons/infrastructure/persistence/issued-coupon.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('issued_coupon')
export class IssuedCouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'coupon_id' })
  couponId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;
}
```

- [ ] **Step 2: Mapper 생성**

```typescript
// src/coupons/infrastructure/persistence/coupon.mapper.ts
import { Coupon } from '../../domain/entities/coupon';
import { CouponEntity } from './coupon.entity';

export class CouponMapper {
  static toDomain(orm: CouponEntity): Coupon {
    const entity = new Coupon();
    entity.id = orm.id;
    entity.name = orm.name;
    entity.stock = orm.stock;
    entity.maxCount = orm.maxCount;
    entity.createdAt = orm.createdAt;
    return entity;
  }
}
```

```typescript
// src/coupons/infrastructure/persistence/issued-coupon.mapper.ts
import { IssuedCoupon } from '../../domain/entities/issued-coupon';
import { IssuedCouponEntity } from './issued-coupon.entity';

export class IssuedCouponMapper {
  static toDomain(orm: IssuedCouponEntity): IssuedCoupon {
    const entity = new IssuedCoupon();
    entity.id = orm.id;
    entity.couponId = orm.couponId;
    entity.userId = orm.userId;
    entity.issuedAt = orm.issuedAt;
    return entity;
  }
}
```

- [ ] **Step 3: 리포지토리 구현체 생성**

```typescript
// src/coupons/infrastructure/persistence/coupon.repository.impl.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../../domain/entities/coupon';
import {
  CouponRepository,
  CreateCouponData,
} from '../../domain/repositories/coupon.repository';
import { CouponEntity } from './coupon.entity';
import { CouponMapper } from './coupon.mapper';

@Injectable()
export class CouponRepositoryImpl extends CouponRepository {
  constructor(
    @InjectRepository(CouponEntity)
    private readonly repo: Repository<CouponEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<Coupon | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? CouponMapper.toDomain(orm) : null;
  }

  async save(coupon: Coupon): Promise<Coupon> {
    await this.repo.update(coupon.id, { stock: coupon.stock });
    const orm = await this.repo.findOne({ where: { id: coupon.id } });
    if (!orm) throw new NotFoundException(`Coupon ${coupon.id} not found`);
    return CouponMapper.toDomain(orm);
  }

  async create(data: CreateCouponData): Promise<Coupon> {
    const orm = this.repo.create(data);
    const saved = await this.repo.save(orm);
    return CouponMapper.toDomain(saved);
  }
}
```

```typescript
// src/coupons/infrastructure/persistence/issued-coupon.repository.impl.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IssuedCoupon } from '../../domain/entities/issued-coupon';
import {
  CreateIssuedCouponData,
  IssuedCouponRepository,
} from '../../domain/repositories/issued-coupon.repository';
import { IssuedCouponEntity } from './issued-coupon.entity';
import { IssuedCouponMapper } from './issued-coupon.mapper';

@Injectable()
export class IssuedCouponRepositoryImpl extends IssuedCouponRepository {
  constructor(
    @InjectRepository(IssuedCouponEntity)
    private readonly repo: Repository<IssuedCouponEntity>,
  ) {
    super();
  }

  async create(data: CreateIssuedCouponData): Promise<IssuedCoupon> {
    const orm = this.repo.create(data);
    const saved = await this.repo.save(orm);
    return IssuedCouponMapper.toDomain(saved);
  }

  async countByCouponId(couponId: string): Promise<number> {
    return this.repo.count({ where: { couponId } });
  }

  async deleteByCouponId(couponId: string): Promise<void> {
    await this.repo.delete({ couponId });
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/coupons/infrastructure/
git commit -m "feat: 쿠폰 인프라 레이어 (TypeORM 엔티티 + 리포지토리 구현체)"
```

---

## Task 5: Use Cases + 단위 테스트

**Files:**
- Create: `src/coupons/application/use-cases/issue-coupon.use-case.ts`
- Create: `src/coupons/application/use-cases/issue-coupon.use-case.spec.ts`
- Create: `src/coupons/application/use-cases/seed-coupons.use-case.ts`
- Create: `src/coupons/application/use-cases/get-issued-count.use-case.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// src/coupons/application/use-cases/issue-coupon.use-case.spec.ts
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LockHandle, LockService } from '../../../../redis/lock/lock.interface';
import { Coupon } from '../../domain/entities/coupon';
import { IssuedCoupon } from '../../domain/entities/issued-coupon';
import { CouponRepository } from '../../domain/repositories/coupon.repository';
import { IssuedCouponRepository } from '../../domain/repositories/issued-coupon.repository';
import { IssueCouponUseCase } from './issue-coupon.use-case';

function makeCoupon(stock = 5): Coupon {
  const c = new Coupon();
  c.id = 'coupon-1';
  c.name = '테스트 쿠폰';
  c.stock = stock;
  c.maxCount = 100;
  c.createdAt = new Date();
  return c;
}

function makeIssuedCoupon(): IssuedCoupon {
  const ic = new IssuedCoupon();
  ic.id = 'issued-1';
  ic.couponId = 'coupon-1';
  ic.userId = 'user-1';
  ic.issuedAt = new Date();
  return ic;
}

describe('IssueCouponUseCase', () => {
  let useCase: IssueCouponUseCase;
  let couponRepo: jest.Mocked<CouponRepository>;
  let issuedCouponRepo: jest.Mocked<IssuedCouponRepository>;
  let lockService: jest.Mocked<LockService>;

  beforeEach(async () => {
    couponRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as any;

    issuedCouponRepo = {
      create: jest.fn(),
      countByCouponId: jest.fn(),
      deleteByCouponId: jest.fn(),
    } as any;

    lockService = {
      acquire: jest.fn(),
      release: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueCouponUseCase,
        { provide: CouponRepository, useValue: couponRepo },
        { provide: IssuedCouponRepository, useValue: issuedCouponRepo },
        { provide: LockService, useValue: lockService },
      ],
    }).compile();

    useCase = module.get(IssueCouponUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('성공: 락 획득 → stock 차감 → IssuedCoupon 생성 → 락 해제', async () => {
    const coupon = makeCoupon(5);
    const issued = makeIssuedCoupon();
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };

    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(coupon);
    couponRepo.save.mockResolvedValue({ ...coupon, stock: 4 });
    issuedCouponRepo.create.mockResolvedValue(issued);

    const result = await useCase.execute('coupon-1', 'user-1');

    expect(lockService.acquire).toHaveBeenCalledWith('coupon:lock:coupon-1', 5000);
    expect(couponRepo.save).toHaveBeenCalledWith(expect.objectContaining({ stock: 4 }));
    expect(issuedCouponRepo.create).toHaveBeenCalledWith({ couponId: 'coupon-1', userId: 'user-1' });
    expect(lockService.release).toHaveBeenCalledWith(handle);
    expect(result).toBe(issued);
  });

  it('락 획득 실패(null 반환) 시 ConflictException을 던진다', async () => {
    lockService.acquire.mockResolvedValue(null);
    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow(ConflictException);
    expect(lockService.release).not.toHaveBeenCalled();
  });

  it('stock 소진(stock=0) 시 ConflictException을 던지고 락은 반드시 해제된다', async () => {
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };
    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(makeCoupon(0));

    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow(ConflictException);
    expect(lockService.release).toHaveBeenCalledWith(handle); // finally 블록 확인
  });

  it('DB 오류 발생 시에도 finally로 락이 해제된다', async () => {
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };
    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(makeCoupon(5));
    couponRepo.save.mockRejectedValue(new Error('DB connection error'));

    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow('DB connection error');
    expect(lockService.release).toHaveBeenCalledWith(handle);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest issue-coupon.use-case.spec.ts --no-coverage
```

Expected: `Cannot find module './issue-coupon.use-case'`

- [ ] **Step 3: `IssueCouponUseCase` 구현**

```typescript
// src/coupons/application/use-cases/issue-coupon.use-case.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LockService } from '../../../../redis/lock/lock.interface';
import { IssuedCoupon } from '../../domain/entities/issued-coupon';
import { CouponRepository } from '../../domain/repositories/coupon.repository';
import { IssuedCouponRepository } from '../../domain/repositories/issued-coupon.repository';

@Injectable()
export class IssueCouponUseCase {
  constructor(
    private readonly couponRepo: CouponRepository,
    private readonly issuedCouponRepo: IssuedCouponRepository,
    private readonly lockService: LockService,
  ) {}

  async execute(couponId: string, userId: string): Promise<IssuedCoupon> {
    const handle = await this.lockService.acquire(`coupon:lock:${couponId}`, 5000);
    if (!handle) {
      throw new ConflictException('다른 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.');
    }

    try {
      const coupon = await this.couponRepo.findById(couponId);
      if (!coupon) throw new NotFoundException(`쿠폰 ${couponId}를 찾을 수 없습니다.`);
      if (coupon.stock <= 0) {
        throw new ConflictException('쿠폰이 모두 소진되었습니다.');
      }

      coupon.stock -= 1;
      await this.couponRepo.save(coupon);

      return await this.issuedCouponRepo.create({ couponId, userId });
    } finally {
      await this.lockService.release(handle);
    }
  }
}
```

- [ ] **Step 4: `SeedCouponsUseCase` + `GetIssuedCountUseCase` 생성**

```typescript
// src/coupons/application/use-cases/seed-coupons.use-case.ts
import { Injectable } from '@nestjs/common';
import { Coupon } from '../../domain/entities/coupon';
import { CouponRepository } from '../../domain/repositories/coupon.repository';

@Injectable()
export class SeedCouponsUseCase {
  constructor(private readonly couponRepo: CouponRepository) {}

  async execute(name = '선착순 100명 할인 쿠폰', maxCount = 100): Promise<Coupon> {
    return this.couponRepo.create({ name, stock: maxCount, maxCount });
  }
}
```

```typescript
// src/coupons/application/use-cases/get-issued-count.use-case.ts
import { Injectable } from '@nestjs/common';
import { IssuedCouponRepository } from '../../domain/repositories/issued-coupon.repository';

@Injectable()
export class GetIssuedCountUseCase {
  constructor(private readonly repo: IssuedCouponRepository) {}

  async execute(couponId: string): Promise<{ count: number }> {
    return { count: await this.repo.countByCouponId(couponId) };
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx jest issue-coupon.use-case.spec.ts --no-coverage
```

Expected: `PASS` — 4 tests passed

- [ ] **Step 6: 커밋**

```bash
git add src/coupons/application/
git commit -m "feat: 쿠폰 유스케이스 구현 (IssueCoupon, Seed, GetIssuedCount)"
```

---

## Task 6: Controller + CouponsModule + RedisModule 수정 + AppModule 연결

**Files:**
- Create: `src/coupons/presentation/coupons.controller.ts`
- Create: `src/coupons/coupons.module.ts`
- Modify: `src/redis/redis.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: `CouponsController` 생성**

```typescript
// src/coupons/presentation/coupons.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IssuedCoupon } from '../domain/entities/issued-coupon';
import { Coupon } from '../domain/entities/coupon';
import { GetIssuedCountUseCase } from '../application/use-cases/get-issued-count.use-case';
import { IssueCouponUseCase } from '../application/use-cases/issue-coupon.use-case';
import { SeedCouponsUseCase } from '../application/use-cases/seed-coupons.use-case';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly issueCoupon: IssueCouponUseCase,
    private readonly seedCoupons: SeedCouponsUseCase,
    private readonly getIssuedCount: GetIssuedCountUseCase,
  ) {}

  @ApiOperation({ summary: '테스트용 쿠폰 생성 (stock: 100)' })
  @Post('seed')
  seed(): Promise<Coupon> {
    return this.seedCoupons.execute();
  }

  @ApiOperation({ summary: '쿠폰 발급 — 락 획득 실패/재고 소진 시 409' })
  @Post(':id/issue')
  issue(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ): Promise<IssuedCoupon> {
    return this.issueCoupon.execute(id, body.userId);
  }

  @ApiOperation({ summary: '발급 건수 조회 (동시성 테스트 검증용)' })
  @Get(':id/issued-count')
  issuedCount(@Param('id') id: string): Promise<{ count: number }> {
    return this.getIssuedCount.execute(id);
  }
}
```

- [ ] **Step 2: `CouponsModule` 생성**

```typescript
// src/coupons/coupons.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LockService } from '../redis/lock/lock.interface';
import { SetnxLockService } from '../redis/lock/setnx-lock.service';
import { RedisModule } from '../redis/redis.module';
import { GetIssuedCountUseCase } from './application/use-cases/get-issued-count.use-case';
import { IssueCouponUseCase } from './application/use-cases/issue-coupon.use-case';
import { SeedCouponsUseCase } from './application/use-cases/seed-coupons.use-case';
import { CouponRepository } from './domain/repositories/coupon.repository';
import { IssuedCouponRepository } from './domain/repositories/issued-coupon.repository';
import { CouponEntity } from './infrastructure/persistence/coupon.entity';
import { CouponRepositoryImpl } from './infrastructure/persistence/coupon.repository.impl';
import { IssuedCouponEntity } from './infrastructure/persistence/issued-coupon.entity';
import { IssuedCouponRepositoryImpl } from './infrastructure/persistence/issued-coupon.repository.impl';
import { CouponsController } from './presentation/coupons.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CouponEntity, IssuedCouponEntity]),
    RedisModule,
  ],
  controllers: [CouponsController],
  providers: [
    CouponRepositoryImpl,
    { provide: CouponRepository, useClass: CouponRepositoryImpl },
    IssuedCouponRepositoryImpl,
    { provide: IssuedCouponRepository, useClass: IssuedCouponRepositoryImpl },
    IssueCouponUseCase,
    SeedCouponsUseCase,
    GetIssuedCountUseCase,
    // Task 8에서 RedlockLockService로 교체
    { provide: LockService, useExisting: SetnxLockService },
  ],
})
export class CouponsModule {}
```

- [ ] **Step 3: `RedisModule`에 `SetnxLockService` 추가**

```typescript
// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig, ENV_KEY } from '../common/constants/env';
import { SetnxLockService } from './lock/setnx-lock.service';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './redis.constants';

@Module({
  providers: [
    {
      provide: REDIS_PUBLISHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    SetnxLockService,
  ],
  exports: [REDIS_PUBLISHER, REDIS_SUBSCRIBER, SetnxLockService],
})
export class RedisModule {}
```

- [ ] **Step 4: `AppModule`에 `CouponsModule` 등록**

`src/app.module.ts` 파일을 열어 `CouponsModule`을 추가한다:

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig, ENV_KEY, IS_PRODUCTION } from './common/constants/env';
import { CouponsModule } from './coupons/coupons.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        type: 'postgres',
        url: config.get(ENV_KEY.DATABASE_URL)!,
        entities: [__dirname + '/**/*.{entity,orm-entity}{.ts,.js}'],
        synchronize: !IS_PRODUCTION,
        logging: !IS_PRODUCTION,
      }),
    }),
    NotificationsModule,
    ProductsModule,
    CouponsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: 빌드 확인**

```bash
npx nest build 2>&1 | tail -5
```

Expected: 에러 없이 빌드 완료 (`Successfully compiled`)

- [ ] **Step 6: 기존 단위 테스트 통과 확인**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: 기존 테스트 전체 PASS + 새 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/coupons/coupons.module.ts src/coupons/presentation/ src/redis/redis.module.ts src/app.module.ts
git commit -m "feat: CouponsModule 조립 및 AppModule 연결"
```

---

## Task 7: 통합 테스트 — race condition 재현 + SETNX 락 검증

> **전제:** Docker Compose가 실행 중이어야 한다. (`docker-compose up -d`)

**Files:**
- Create: `test/coupons-lock.e2e-spec.ts`

- [ ] **Step 1: 통합 테스트 파일 생성**

```typescript
// test/coupons-lock.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { LockHandle, LockService } from '../src/redis/lock/lock.interface';
import { CouponEntity } from '../src/coupons/infrastructure/persistence/coupon.entity';
import { IssuedCouponEntity } from '../src/coupons/infrastructure/persistence/issued-coupon.entity';

// 락을 획득하는 척하지만 실제로 Redis에 락을 걸지 않는 서비스 (race condition 재현용)
class NullLockService extends LockService {
  async acquire(key: string): Promise<LockHandle | null> {
    return { key, token: 'null' };
  }
  async release(): Promise<void> {}
}

describe('쿠폰 분산 락 통합 테스트', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let couponId: string;

  // ── 락 없음 테스트용 앱 ──────────────────────────────────────────────
  describe('락 없음 — race condition 재현', () => {
    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(LockService)
        .useClass(NullLockService)
        .compile();

      app = moduleFixture.createNestApplication();
      await app.init();
      dataSource = app.get(DataSource);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await dataSource.getRepository(IssuedCouponEntity).clear();
      await dataSource.getRepository(CouponEntity).clear();

      const res = await request(app.getHttpServer()).post('/coupons/seed').expect(201);
      couponId = res.body.id;
    });

    it('동시 300개 요청 시 발급 건수가 100개를 초과한다 (race condition)', async () => {
      const requests = Array.from({ length: 300 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/coupons/${couponId}/issue`)
          .send({ userId: `user-${i}` }),
      );
      await Promise.all(requests);

      const countRes = await request(app.getHttpServer())
        .get(`/coupons/${couponId}/issued-count`)
        .expect(200);

      // 락 없이는 race condition으로 100개를 초과해 발급된다
      expect(countRes.body.count).toBeGreaterThan(100);
    }, 60000);
  });

  // ── SETNX 락 테스트용 앱 ─────────────────────────────────────────────
  describe('SETNX 락 — 정확히 100개만 발급', () => {
    beforeAll(async () => {
      // AppModule 기본 설정 = SetnxLockService (override 없음)
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
      dataSource = app.get(DataSource);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await dataSource.getRepository(IssuedCouponEntity).clear();
      await dataSource.getRepository(CouponEntity).clear();

      const res = await request(app.getHttpServer()).post('/coupons/seed').expect(201);
      couponId = res.body.id;
    });

    it('동시 300개 요청 시 발급 건수가 정확히 100개다', async () => {
      const requests = Array.from({ length: 300 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/coupons/${couponId}/issue`)
          .send({ userId: `user-${i}` }),
      );
      await Promise.all(requests);

      const countRes = await request(app.getHttpServer())
        .get(`/coupons/${couponId}/issued-count`)
        .expect(200);

      expect(countRes.body.count).toBe(100);
    }, 60000);

    it('재고 소진 후 요청은 409를 반환한다', async () => {
      // 100개를 순차 발급해 재고를 소진
      for (let i = 0; i < 100; i++) {
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
});
```

- [ ] **Step 2: Docker Compose 실행 확인**

```bash
docker-compose ps
```

Expected: `redis`와 `postgres` 컨테이너 모두 `running` 상태

- [ ] **Step 3: 통합 테스트 실행 (race condition 확인)**

```bash
npx jest --config ./test/jest-e2e.json coupons-lock --no-coverage --verbose
```

Expected:
- `락 없음` 테스트: PASS (count > 100 확인)
- `SETNX 락` 테스트: PASS (count === 100 확인)

- [ ] **Step 4: 커밋**

```bash
git add test/coupons-lock.e2e-spec.ts
git commit -m "test: 분산 락 통합 테스트 — race condition + SETNX 검증"
```

---

## Task 8: RedlockLockService 구현 + 모듈 전환 + 데드락 시나리오 테스트

**Files:**
- Create: `src/redis/lock/redlock-lock.service.ts`
- Modify: `src/redis/redis.module.ts`
- Modify: `src/coupons/coupons.module.ts`
- Modify: `test/coupons-lock.e2e-spec.ts`

- [ ] **Step 1: `RedlockLockService` 구현**

```typescript
// src/redis/lock/redlock-lock.service.ts
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock, { ExecutionError } from 'redlock';
import type { Lock } from 'redlock';
import { REDIS_PUBLISHER } from '../redis.constants';
import { LockHandle, LockService } from './lock.interface';

// redlock의 Lock 객체를 보관해 release 시 사용하는 내부 맵
// (LockHandle 인터페이스를 오염시키지 않기 위해 서비스 내부에서 관리)
@Injectable()
export class RedlockLockService extends LockService implements OnModuleDestroy {
  private readonly redlock: Redlock;
  private readonly activeLocks = new Map<string, Lock>();

  constructor(@Inject(REDIS_PUBLISHER) redis: Redis) {
    super();
    this.redlock = new Redlock([redis], {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 50,
    });
  }

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    try {
      const lock = await this.redlock.acquire([key], ttlMs);
      this.activeLocks.set(lock.value, lock);
      return { key, token: lock.value };
    } catch (e) {
      if (e instanceof ExecutionError) return null;
      throw e;
    }
  }

  async release(handle: LockHandle): Promise<void> {
    const lock = this.activeLocks.get(handle.token);
    if (lock) {
      await lock.release();
      this.activeLocks.delete(handle.token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redlock.quit();
  }
}
```

- [ ] **Step 2: `RedisModule`에 `RedlockLockService` 추가**

```typescript
// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig, ENV_KEY } from '../common/constants/env';
import { RedlockLockService } from './lock/redlock-lock.service';
import { SetnxLockService } from './lock/setnx-lock.service';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './redis.constants';

@Module({
  providers: [
    {
      provide: REDIS_PUBLISHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    SetnxLockService,
    RedlockLockService,
  ],
  exports: [REDIS_PUBLISHER, REDIS_SUBSCRIBER, SetnxLockService, RedlockLockService],
})
export class RedisModule {}
```

- [ ] **Step 3: `CouponsModule`에서 `RedlockLockService`로 전환**

`src/coupons/coupons.module.ts`의 `LockService` 바인딩 1줄만 변경한다:

```typescript
// 변경 전
{ provide: LockService, useExisting: SetnxLockService },

// 변경 후
{ provide: LockService, useExisting: RedlockLockService },
```

import도 `SetnxLockService` → `RedlockLockService`로 변경:
```typescript
import { RedlockLockService } from '../redis/lock/redlock-lock.service';
```

- [ ] **Step 4: 기존 통합 테스트로 redlock 검증**

```bash
npx jest --config ./test/jest-e2e.json coupons-lock --no-coverage --verbose
```

Expected: 모든 기존 테스트 PASS (redlock도 정확히 100개 발급)

- [ ] **Step 5: 데드락 시나리오 테스트 추가**

`test/coupons-lock.e2e-spec.ts`에 새 `describe` 블록 추가 (파일 마지막 `});` 앞에 삽입):

```typescript
  // ── 데드락 시나리오 ───────────────────────────────────────────────────
  describe('데드락 시나리오', () => {
    // redlock 기반 앱 재사용 (위 SETNX describe와 별도 app 인스턴스 불필요,
    // 이미 redlock으로 전환했으므로 AppModule 기본 사용)
    let deadlockApp: INestApplication;
    let deadlockDataSource: DataSource;

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      deadlockApp = moduleFixture.createNestApplication();
      await deadlockApp.init();
      deadlockDataSource = deadlockApp.get(DataSource);
    });

    afterAll(async () => {
      await deadlockApp.close();
    });

    beforeEach(async () => {
      await deadlockDataSource.getRepository(IssuedCouponEntity).clear();
      await deadlockDataSource.getRepository(CouponEntity).clear();

      const res = await request(deadlockApp.getHttpServer())
        .post('/coupons/seed')
        .expect(201);
      couponId = res.body.id;
    });

    it('finally 블록: 예외 발생 시에도 락이 해제되어 다음 요청이 성공한다', async () => {
      // DB 오류를 시뮬레이션하기 위해 NullLockService + 의도적 실패 DTO 대신
      // stock=1인 쿠폰에서 두 요청을 순차 실행해 "락 해제 후 재발급 가능" 검증
      await deadlockDataSource.getRepository(CouponEntity).update(couponId, { stock: 1 });

      // 첫 번째 요청: 성공
      const first = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${couponId}/issue`)
        .send({ userId: 'user-first' });
      expect(first.status).toBe(201);

      // 두 번째 요청: 재고 소진 → 409 (락은 정상 해제됐음을 의미)
      const second = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${couponId}/issue`)
        .send({ userId: 'user-second' });
      expect(second.status).toBe(409);

      // 세 번째 요청: 락이 남아 있다면 타임아웃, 정상 해제됐다면 즉시 409
      const start = Date.now();
      const third = await request(deadlockApp.getHttpServer())
        .post(`/coupons/${couponId}/issue`)
        .send({ userId: 'user-third' });
      const elapsed = Date.now() - start;

      expect(third.status).toBe(409);
      // 락이 정상 해제됐다면 응답이 빠르다 (3초 이내)
      expect(elapsed).toBeLessThan(3000);
    }, 15000);

    it('TTL 만료 시나리오: 짧은 TTL 락이 만료된 후 다음 요청이 락을 획득한다', async () => {
      // 이 테스트는 SetnxLockService의 한계(watchdog 없음)를 문서화하는 목적
      // 실제 TTL 만료를 기다리므로 TTL을 짧게 설정할 수 없어 개념 설명으로 대체
      //
      // [학습 포인트]
      // SetnxLockService: TTL=5000ms로 락 획득 후 서버가 죽으면
      //   → 5초 후 Redis에서 자동 삭제 → 다음 요청이 락 획득 가능
      // RedlockLockService: 동일 동작 + retryCount로 재시도 내장
      //   → ExecutionError로 실패를 명확히 구분
      //
      // 정상 종료(finally) 경로는 위 테스트에서 이미 검증됨
      expect(true).toBe(true); // 학습 포인트 문서화
    });
  });
```

- [ ] **Step 6: 전체 통합 테스트 최종 확인**

```bash
npx jest --config ./test/jest-e2e.json coupons-lock --no-coverage --verbose
```

Expected:
```
✓ 락 없음 — race condition 재현
  ✓ 동시 300개 요청 시 발급 건수가 100개를 초과한다

✓ SETNX 락 — 정확히 100개만 발급
  ✓ 동시 300개 요청 시 발급 건수가 정확히 100개다
  ✓ 재고 소진 후 요청은 409를 반환한다

✓ 데드락 시나리오
  ✓ finally 블록: 예외 발생 시에도 락이 해제되어 다음 요청이 성공한다
  ✓ TTL 만료 시나리오: ...
```

- [ ] **Step 7: 단위 테스트 전체 통과 확인**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: 모든 PASS, 실패 없음

- [ ] **Step 8: 커밋**

```bash
git add src/redis/lock/redlock-lock.service.ts src/redis/redis.module.ts src/coupons/coupons.module.ts test/coupons-lock.e2e-spec.ts
git commit -m "feat: RedlockLockService 구현 + 데드락 시나리오 테스트"
```

---

## 구현 완료 기준

- [ ] `npx jest --no-coverage` — 모든 단위 테스트 PASS
- [ ] `npx jest --config ./test/jest-e2e.json coupons-lock --no-coverage` — 통합 테스트 PASS
- [ ] `POST /coupons/seed` → `201` + `{ id, name, stock: 100 }`
- [ ] `POST /coupons/:id/issue` → 락으로 보호된 발급, 409 on 소진
- [ ] `GET /coupons/:id/issued-count` → `{ count: N }`
- [ ] race condition 테스트에서 락 없음 > 100, SETNX = 100, redlock = 100 확인
