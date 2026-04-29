import { Injectable } from '@nestjs/common';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { QueryNotificationDto } from '../dto/query-notification.dto';

@Injectable()
export class GetNotificationsUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  execute(query: QueryNotificationDto): Promise<Notification[]> {
    return this.notificationRepository.findAll({
      userId: query.userId,
      status: query.status,
    });
  }
}
