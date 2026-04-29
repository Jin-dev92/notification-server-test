import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConnectionStatus } from './components/ConnectionStatus';
import { NotificationList } from './components/NotificationList';
import { useCreateNotification } from './hooks/mutations/useNotificationMutations';
import { notificationQueryKeys } from './hooks/queries/useNotificationQueries';
import { useNotificationStream } from './hooks/useNotificationStream';
import { useUserStore } from './store/user.store';
import { NotificationType } from './types/api/notifications.types';

export const App = () => {
  const { userId, setUserId } = useUserStore();
  const [inputId, setInputId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);

  const queryClient = useQueryClient();
  const { mutate: createNotification, isPending: isSending } = useCreateNotification({
    onSuccess: () => {
      setTitle('');
      setBody('');
    },
  });

  const { status, liveEvents } = useNotificationStream(userId, () => {
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
  });

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
        알림 대시보드
      </h1>

      {/* userId 설정 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>SSE 연결</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            placeholder="userId 입력 (예: user-1)"
            style={inputStyle}
          />
          <button
            onClick={() => setUserId(inputId.trim())}
            disabled={!inputId.trim()}
            style={btnStyle}
          >
            연결
          </button>
        </div>
        {userId && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>userId: <b>{userId}</b></span>
            <ConnectionStatus status={status} />
          </div>
        )}
      </section>

      {/* 알림 발송 (테스트용) */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>알림 발송 테스트</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isBroadcast}
              onChange={(e) => setIsBroadcast(e.target.checked)}
            />
            전체 브로드캐스트
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="알림 제목"
            style={inputStyle}
          />
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="알림 본문 (선택)"
            style={inputStyle}
          />
          <button
            onClick={() =>
              createNotification({
                userId: isBroadcast ? undefined : (userId ?? undefined),
                broadcast: isBroadcast || undefined,
                type: NotificationType.INFO,
                title,
                body: body || undefined,
              })
            }
            disabled={!title.trim() || (!isBroadcast && !userId) || isSending}
            style={btnStyle}
          >
            {isSending ? '발송 중...' : '발송'}
          </button>
        </div>
      </section>

      {/* 실시간 수신 이벤트 */}
      {liveEvents.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>실시간 수신 ({liveEvents.length})</h2>
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {liveEvents.map((e, i) => (
              <div key={i} style={{ color: '#166534' }}>
                [{new Date(e.createdAt).toLocaleTimeString('ko-KR')}] {e.title}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 전체 알림 목록 */}
      {userId && (
        <section>
          <h2 style={sectionTitle}>전체 알림 목록</h2>
          <NotificationList userId={userId} />
        </section>
      )}
    </div>
  );
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 12,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#3b82f6',
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};
