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
