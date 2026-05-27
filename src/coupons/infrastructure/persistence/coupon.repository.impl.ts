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
