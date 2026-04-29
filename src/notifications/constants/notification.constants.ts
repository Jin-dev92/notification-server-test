export const NotificationType = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  READ: 'read',
} as const;
export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const BROADCAST_USER_ID = 'broadcast';

const USER_CHANNEL_PREFIX = 'notification:user:';
export const REDIS_CHANNEL = {
  BROADCAST: 'notification:broadcast',
  USER_CHANNEL_PREFIX,
  user: (userId: string) => `${USER_CHANNEL_PREFIX}${userId}`,
} as const;
