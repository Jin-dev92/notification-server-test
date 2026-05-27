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
