import { Injectable } from '@nestjs/common';
import { IssuedCouponRepository } from '../../domain/repositories/issued-coupon.repository';

@Injectable()
export class GetIssuedCountUseCase {
  constructor(private readonly repo: IssuedCouponRepository) {}

  async execute(couponId: string): Promise<{ count: number }> {
    return { count: await this.repo.countByCouponId(couponId) };
  }
}
