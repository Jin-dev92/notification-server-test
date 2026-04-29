import { Injectable } from '@nestjs/common';
import { NotificationStatus } from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';

@Injectable()
export class FindAndMarkMissedUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(userId: string, afterId: number): Promise<Notification[]> {
    const missed = await this.notificationRepository.findMissed(
      userId,
      afterId,
    );
    if (missed.length > 0) {
      await this.notificationRepository.updateManyStatus(
        missed.map((n) => n.id),
        NotificationStatus.DELIVERED,
      );
    }
    return missed;
  }
}
