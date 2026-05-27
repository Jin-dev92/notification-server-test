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
