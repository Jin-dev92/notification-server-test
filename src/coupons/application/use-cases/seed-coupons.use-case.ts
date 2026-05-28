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
