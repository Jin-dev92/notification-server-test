import {
  NotificationStatus,
  NotificationType,
} from '../../constants/notification.constants';
import { Notification } from '../entities/notification';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  status: NotificationStatus;
}

export abstract class NotificationRepository {
  abstract create(data: CreateNotificationData): Promise<Notification>;
  abstract update(notification: Notification): Promise<Notification>;
  abstract findById(id: number): Promise<Notification | null>;
  abstract findAll(query: {
    userId: string;
    status?: NotificationStatus;
  }): Promise<Notification[]>;
  abstract findMissed(userId: string, afterId: number): Promise<Notification[]>;
  abstract updateStatus(id: number, status: NotificationStatus): Promise<void>;
  abstract updateManyStatus(
    ids: number[],
    status: NotificationStatus,
  ): Promise<void>;
}
