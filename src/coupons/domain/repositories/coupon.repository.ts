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
