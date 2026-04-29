import {
  UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { createNotification, markNotificationAsRead } from '../../api/notifications';
import {
  CreateNotificationRequest,
  NotificationResponse,
} from '../../types/api/notifications.types';
import { notificationQueryKeys } from '../queries/useNotificationQueries';

export const useMarkAsRead = (
  options?: UseMutationOptions<NotificationResponse, Error, number>,
) => {
  const queryClient = useQueryClient();
  return useMutation<NotificationResponse, Error, number>({
    mutationFn: (id) => markNotificationAsRead(id).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
    ...options,
  });
};

export const useCreateNotification = (
  options?: UseMutationOptions<NotificationResponse, Error, CreateNotificationRequest>,
) => {
  const queryClient = useQueryClient();
  return useMutation<NotificationResponse, Error, CreateNotificationRequest>({
    mutationFn: (req) => createNotification(req).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
    ...options,
  });
};
