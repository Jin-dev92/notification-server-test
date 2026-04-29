import { useMarkAsRead } from '../hooks/mutations/useNotificationMutations';
import { NotificationResponse, NotificationStatus, NotificationType } from '../types/api/notifications.types';

const TYPE_COLOR: Record<NotificationType, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
};

interface Props {
  notification: NotificationResponse;
}

export const NotificationItem = ({ notification }: Props) => {
  const { mutate: markAsRead, isPending } = useMarkAsRead();
  const isRead = notification.status === NotificationStatus.READ;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        border: `1px solid ${isRead ? '#e5e7eb' : '#dbeafe'}`,
        backgroundColor: isRead ? '#f9fafb' : '#eff6ff',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          backgroundColor: TYPE_COLOR[notification.type],
          whiteSpace: 'nowrap',
          marginTop: 2,
        }}
      >
        {notification.type}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111827' }}>
          {notification.title}
        </p>
        {notification.body && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            {notification.body}
          </p>
        )}
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          {new Date(notification.createdAt).toLocaleString('ko-KR')} · {notification.status}
        </p>
      </div>

      {!isRead && (
        <button
          onClick={() => markAsRead(notification.id)}
          disabled={isPending}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            fontSize: 13,
            cursor: isPending ? 'not-allowed' : 'pointer',
            color: '#374151',
            whiteSpace: 'nowrap',
          }}
        >
          {isPending ? '처리 중' : '읽음'}
        </button>
      )}
    </div>
  );
};
