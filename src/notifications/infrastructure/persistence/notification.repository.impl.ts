import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { NotificationStatus } from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import {
  CreateNotificationData,
  NotificationRepository,
} from '../../domain/repositories/notification.repository';
import { NotificationMapper } from './notification.mapper';
import { NotificationEntity } from './notification.entity';

@Injectable()
export class NotificationRepositoryImpl extends NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {
    super();
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    const orm = this.repo.create(data);
    const saved = await this.repo.save(orm);
    return NotificationMapper.toDomain(saved);
  }

  async update(notification: Notification): Promise<Notification> {
    const orm = NotificationMapper.toOrm(notification);
    const saved = await this.repo.save(orm);
    return NotificationMapper.toDomain(saved);
  }

  async findById(id: number): Promise<Notification | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? NotificationMapper.toDomain(orm) : null;
  }

  async findAll(query: {
    userId: string;
    status?: NotificationStatus;
  }): Promise<Notification[]> {
    const where: Record<string, unknown> = { userId: query.userId };
    if (query.status) where.status = query.status;
    const orms = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return orms.map((orm) => NotificationMapper.toDomain(orm));
  }

  async findMissed(userId: string, afterId: number): Promise<Notification[]> {
    const orms = await this.repo.find({
      where: {
        userId,
        id: MoreThan(afterId),
        status: NotificationStatus.PENDING,
      },
      order: { id: 'ASC' },
    });
    return orms.map((orm) => NotificationMapper.toDomain(orm));
  }

  async updateStatus(id: number, status: NotificationStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  async updateManyStatus(
    ids: number[],
    status: NotificationStatus,
  ): Promise<void> {
    await this.repo.update({ id: In(ids) }, { status });
  }
}
