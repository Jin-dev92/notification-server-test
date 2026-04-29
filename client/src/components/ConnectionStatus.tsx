import {
  ConnectionStatus as Status,
} from '../hooks/useNotificationStream';

const LABEL: Record<Status, string> = {
  connecting: '연결 중...',
  connected: '연결됨',
  disconnected: '연결 끊김',
};

const COLOR: Record<Status, string> = {
  connecting: '#f59e0b',
  connected: '#10b981',
  disconnected: '#ef4444',
};

interface Props {
  status: Status;
}

export const ConnectionStatus = ({ status }: Props) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: COLOR[status],
        display: 'inline-block',
      }}
    />
    <span style={{ fontSize: 14, color: '#6b7280' }}>{LABEL[status]}</span>
  </div>
);
