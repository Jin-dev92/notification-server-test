import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_SUBSCRIBER } from '../../../redis/redis.constants';
import { SseManagerService } from '../../../sse/sse-manager.service';
import {
  NotificationStatus,
  REDIS_CHANNEL,
} from '../../constants/notification.constants';
import { NotificationRepository } from '../../domain/repositories/notification.repository';

interface RedisPayload {
  notificationId: number;
  id: number;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationEventService implements OnModuleInit {
  private readonly userChannelRefs = new Map<string, number>();

  constructor(
    @Inject(REDIS_SUBSCRIBER)
    private readonly subscriber: Redis,
    private readonly sseManager: SseManagerService,
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleRedisMessage(channel, message);
    });
    await this.subscriber.subscribe(REDIS_CHANNEL.BROADCAST);
  }

  private handleRedisMessage(channel: string, message: string): void {
    const { notificationId, ...ssePayload }: RedisPayload = JSON.parse(message);

    if (channel === REDIS_CHANNEL.BROADCAST) {
      this.sseManager.emitToAll(ssePayload);
      void this.notificationRepository.updateStatus(
        notificationId,
        NotificationStatus.DELIVERED,
      );
    } else {
      const userId = channel.slice(REDIS_CHANNEL.USER_CHANNEL_PREFIX.length);
      if (this.sseManager.hasConnection(userId)) {
        this.sseManager.emit(userId, ssePayload);
        void this.notificationRepository.updateStatus(
          notificationId,
          NotificationStatus.DELIVERED,
        );
      }
    }
  }

  async subscribeUserChannel(userId: string): Promise<void> {
    const current = this.userChannelRefs.get(userId) ?? 0;
    if (current === 0) {
      await this.subscriber.subscribe(REDIS_CHANNEL.user(userId));
    }
    this.userChannelRefs.set(userId, current + 1);
  }

  async unsubscribeUserChannel(userId: string): Promise<void> {
    const current = this.userChannelRefs.get(userId) ?? 0;
    if (current <= 1) {
      this.userChannelRefs.delete(userId);
      await this.subscriber.unsubscribe(REDIS_CHANNEL.user(userId));
    } else {
      this.userChannelRefs.set(userId, current - 1);
    }
  }
}
