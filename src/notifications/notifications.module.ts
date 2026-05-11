import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../redis/redis.module';
import { SseModule } from '../sse/sse.module';
import { NotificationEventService } from './application/services/notification-event.service';
import { CreateNotificationUseCase } from './application/use-cases/create-notification.use-case';
import { FindAndMarkMissedUseCase } from './application/use-cases/find-and-mark-missed.use-case';
import { GetNotificationsUseCase } from './application/use-cases/get-notifications.use-case';
import { MarkAsReadUseCase } from './application/use-cases/mark-as-read.use-case';
import { NotificationRepository } from './domain/repositories/notification.repository';
import { NotificationEntity } from './infrastructure/persistence/notification.entity';
import { NotificationTypeOrmRepository } from './infrastructure/persistence/notification.typeorm.repository';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    RedisModule,
    SseModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationTypeOrmRepository,
    {
      provide: NotificationRepository,
      useClass: NotificationTypeOrmRepository,
    },
    CreateNotificationUseCase,
    GetNotificationsUseCase,
    MarkAsReadUseCase,
    FindAndMarkMissedUseCase,
    NotificationEventService,
  ],
})
export class NotificationsModule {}
