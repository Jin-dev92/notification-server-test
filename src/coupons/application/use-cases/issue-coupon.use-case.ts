import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LockService } from '../../../redis/lock/lock.interface';
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
