import { axiosInstance } from '../lib/axios';
import {
  CreateNotificationRequest,
  NotificationResponse,
  NotificationStatus,
} from '../types/api/notifications.types';

export const getNotifications = (userId: string, status?: NotificationStatus) =>
  axiosInstance.get<NotificationResponse[]>('/notifications', {
    params: { userId, status },
  });

export const markNotificationAsRead = (id: number) =>
  axiosInstance.patch<NotificationResponse>(`/notifications/${id}/read`);

export const createNotification = (req: CreateNotificationRequest) =>
  axiosInstance.post<NotificationResponse>('/notifications', req);
