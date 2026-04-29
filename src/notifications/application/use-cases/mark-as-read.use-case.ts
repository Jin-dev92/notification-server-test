import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';

@Injectable()
export class MarkAsReadUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(id: number): Promise<Notification> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification) {
      throw new NotFoundException(`알림을 찾을 수 없습니다: ${id}`);
    }
    notification.markAsRead();
    return this.notificationRepository.update(notification);
  }
}
