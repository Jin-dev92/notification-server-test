export const NotificationType = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  READ: 'read',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

// @see OpenAPI spec: GET /notifications
export interface NotificationResponse {
  id: number;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
}

// @see OpenAPI spec: POST /notifications
export interface CreateNotificationRequest {
  userId?: string;
  broadcast?: boolean;
  type?: NotificationType;
  title: string;
  body?: string;
}

export interface NotificationStreamEvent {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  createdAt: string;
}
