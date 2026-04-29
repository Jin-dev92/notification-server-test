import { useEffect, useRef, useState } from 'react';
import { ENV } from '../constants/env';
import { NotificationStreamEvent } from '../types/api/notifications.types';

export const ConnectionStatus = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
} as const;
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

interface UseNotificationStreamResult {
  status: ConnectionStatus;
  liveEvents: NotificationStreamEvent[];
}

export const useNotificationStream = (
  userId: string | null,
  onEvent?: (event: NotificationStreamEvent) => void,
): UseNotificationStreamResult => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [liveEvents, setLiveEvents] = useState<NotificationStreamEvent[]>([]);

  // ref로 콜백 최신화 — onEvent를 deps에 넣으면 재연결 루프 발생
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!userId) return;

    const url = `${ENV.API_URL}/notifications/stream?userId=${encodeURIComponent(userId)}`;
    const es = new EventSource(url);
    setStatus(ConnectionStatus.CONNECTING);

    es.onopen = () => setStatus(ConnectionStatus.CONNECTED);

    const handleNotification = (e: MessageEvent<string>) => {
      const payload: NotificationStreamEvent = JSON.parse(e.data);
      setLiveEvents((prev) => [payload, ...prev]);
      onEventRef.current?.(payload);
    };
    es.addEventListener('notification', handleNotification);

    es.onerror = () => setStatus(ConnectionStatus.DISCONNECTED);

    return () => {
      es.removeEventListener('notification', handleNotification);
      es.close();
      setStatus(ConnectionStatus.DISCONNECTED);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { status, liveEvents };
};
