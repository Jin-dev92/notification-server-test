import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('issued_coupon')
export class IssuedCouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'coupon_id' })
  couponId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;
}
