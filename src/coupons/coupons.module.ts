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
