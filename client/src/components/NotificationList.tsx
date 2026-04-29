import { useGetNotifications } from '../hooks/queries/useNotificationQueries';
import { NotificationItem } from './NotificationItem';

interface Props {
  userId: string;
}

export const NotificationList = ({ userId }: Props) => {
  const { data: notifications, isLoading, isError } = useGetNotifications(userId);

  if (isLoading) return <p style={{ color: '#6b7280', fontSize: 14 }}>불러오는 중...</p>;
  if (isError) return <p style={{ color: '#ef4444', fontSize: 14 }}>목록 조회 실패</p>;
  if (!notifications?.length)
    return <p style={{ color: '#9ca3af', fontSize: 14 }}>알림이 없습니다.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  );
};
