import {
  NotificationStatus,
  NotificationType,
} from '../../constants/notification.constants';

export class Notification {
  id: number;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;

  markAsRead(): void {
    this.status = NotificationStatus.READ;
    this.readAt = new Date();
  }
}
