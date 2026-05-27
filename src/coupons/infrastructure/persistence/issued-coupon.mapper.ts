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
