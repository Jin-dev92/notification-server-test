import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('coupon')
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'int' })
  stock: number;

  @Column({ name: 'max_count', type: 'int' })
  maxCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
