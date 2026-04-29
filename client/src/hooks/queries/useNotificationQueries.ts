import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import { getNotifications } from '../../api/notifications';
import {
  NotificationResponse,
  NotificationStatus,
} from '../../types/api/notifications.types';

export const notificationQueryKeys = {
  all: ['notification'] as const,
  list: (userId: string, status?: NotificationStatus) =>
    ['notification', '/api/notifications', { userId, status }] as const,
};

export const useGetNotifications = (
  userId: string | null,
  status?: NotificationStatus,
  options?: Partial<UseQueryOptions<NotificationResponse[]>>,
) =>
  useQuery<NotificationResponse[]>({
    queryKey: notificationQueryKeys.list(userId ?? '', status),
    queryFn: () => getNotifications(userId!, status).then((res) => res.data),
    enabled: !!userId,
    staleTime: 0,
    ...options,
  });
