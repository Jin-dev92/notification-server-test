import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PUBLISHER } from '../../../redis/redis.constants';
import {
  BROADCAST_USER_ID,
  NotificationStatus,
  NotificationType,
  REDIS_CHANNEL,
} from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { CreateNotificationDto } from '../dto/create-notification.dto';

interface RedisPayload {
  notificationId: number;
  id: number;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
}

@Injectable()
export class CreateNotificationUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    @Inject(REDIS_PUBLISHER)
    private readonly publisher: Redis,
  ) {}

  async execute(dto: CreateNotificationDto): Promise<Notification> {
    if (!dto.userId && !dto.broadcast) {
      throw new BadRequestException(
        'userId 또는 broadcast 중 하나는 필수입니다.',
      );
    }

    const notification = await this.notificationRepository.create({
      userId: dto.userId ?? BROADCAST_USER_ID,
      type: dto.type ?? NotificationType.INFO,
      title: dto.title,
      body: dto.body ?? null,
      status: NotificationStatus.PENDING,
    });

    const payload: RedisPayload = {
      notificationId: notification.id,
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt.toISOString(),
    };

    const channel = dto.broadcast
      ? REDIS_CHANNEL.BROADCAST
      : REDIS_CHANNEL.user(dto.userId!);
    await this.publisher.publish(channel, JSON.stringify(payload));

    return notification;
  }
}
