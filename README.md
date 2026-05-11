# 실시간 알림 서버

Redis Pub/Sub과 SSE를 기반으로 다중 인스턴스 환경에서 동작하는 알림 시스템입니다.

---

## 만든 이유

실무에서 알림 기능을 쓸 때 항상 "이게 왜 이렇게 동작하지?"라는 의문이 남았습니다. 특히 서버가 여러 대일 때 SSE 연결은 어떻게 관리되는지, 
Redis를 단순 캐시가 아닌 메시지 브로커로 쓰면 어떤 제약이 생기는지 직접 부딪혀보고 싶었습니다.

알람 기능에서 정확히 알고 넘어가야 하는 내용:

- SSE와 WebSocket의 선택 기준은 정확히 어디서 갈리는가
- `SUBSCRIBE` 상태의 Redis 커넥션은 왜 다른 명령을 받을 수 없는가
- 서버 A에 SSE 연결된 클라이언트에게, 서버 B로 들어온 요청의 알림을 어떻게 전달하는가
- "정확히 한 번 전달"은 Redis Pub/Sub만으로 보장 가능한가

---

## 아키텍처

```
POST /notifications
       │
       ▼
 NestJS (서버 A)  ──→  Redis PUBLISH  ──→  channel: notification:user:{userId}
                                                      │
                              ┌───────────────────────┤
                              ▼                       ▼
                        서버 A (SUBSCRIBE)       서버 B (SUBSCRIBE)
                              │
                   userId SSE 연결 있으면 push
                              │
                     DB status → delivered
```

nginx가 `ip_hash`로 SSE 연결을 스티키하게 라우팅합니다. 알림 발송 요청은 어느 서버로 가든 Redis를 통해 SSE 연결이 있는 서버로 전달됩니다.

---

## 핵심 설계 결정

### SSE 선택

알림은 서버 → 클라이언트 단방향입니다. "읽음 처리" 같은 사용자 액션은 REST로 처리하면 충분합니다. WebSocket은 이 요구사항엔 과하고, SSE는 HTTP를 그대로 쓰니 프록시 설정도 단순하고 브라우저 재연결도 알아서 됩니다.

### Redis 인스턴스 분리

Redis `SUBSCRIBE` 명령을 실행한 커넥션은 구독 관련 명령 외에 아무것도 받을 수 없습니다. PUBLISH, GET 등을 섞어 쓰려면 커넥션을 반드시 분리해야 합니다.

```typescript
{ provide: REDIS_PUBLISHER, useFactory: () => new Redis(REDIS_URL) }
{ provide: REDIS_SUBSCRIBER, useFactory: () => new Redis(REDIS_URL) }
```

### SSE 스트림 관리

`Map<userId, Set<Subject<MessageEvent>>>` 구조로 관리합니다. `Set`을 사용한 이유는 같은 userId로 탭을 여러 개 열었을 때 모두 수신해야 하기 때문입니다. 연결이 끊기면 `req.on('close')`에서 해당 Subject를 `complete()` 처리해 메모리 누수를 방지합니다.

userId별 Redis 채널 구독도 ref-counting으로 관리합니다. 같은 userId로 탭이 2개 열려 있으면 Redis 구독은 1개만 유지하고, 마지막 탭이 닫힐 때 구독을 해제합니다.

### 전달 보장: At-Least-Once

Redis Pub/Sub은 Fire-and-Forget입니다. 메시지를 PUBLISH할 때 구독자가 없으면 사라집니다. Exactly-Once를 제대로 보장하려면 Kafka나 Redis Stream 같은 걸 써야 합니다.

이 프로젝트에서는 알림을 DB에 먼저 `pending` 상태로 저장하고, SSE 전달 시 `delivered`로 업데이트합니다. 브라우저가 SSE 재연결 시 `Last-Event-ID` 헤더를 전송하면, 서버는 해당 ID 이후의 `pending` 알림을 조회해 즉시 재전송합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | NestJS 11, TypeORM, PostgreSQL |
| 메시지 | Redis 7, ioredis |
| Frontend | React 18, React Query v5, Zustand |
| Infra | Docker Compose, nginx |

---

## 실행

```bash
# 인프라 시작 (PostgreSQL + Redis)
docker-compose up -d

# 환경 변수 설정
cp .env.example .env

# 백엔드 (포트 3000)
npm install && npm run start:dev

# 프론트엔드 (포트 5173)
cd client && npm install && npm run dev
```

- Swagger UI: http://localhost:3000/api-docs
- 대시보드: http://localhost:5173

---

## 동작 확인

서버가 뜨면 아래 순서로 전체 흐름을 확인할 수 있습니다.

**1. SSE 연결**

```bash
curl -N "http://localhost:3000/notifications/stream?userId=user-1"
# 연결 유지 상태로 대기
```

**2. 알림 발송 (다른 터미널)**

```bash
# 특정 유저
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","title":"주문 완료","body":"결제가 완료되었어요"}'

# 전체 브로드캐스트
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -d '{"broadcast":true,"title":"서버 점검 예정"}'
```

첫 번째 터미널에 `event: notification` 이벤트가 즉시 출력되면 정상입니다.

**3. Last-Event-ID 재연결 (At-Least-Once 검증)**

```bash
# 알림 몇 개 발송 후 SSE를 끊고, 마지막 수신 id 이후부터 재연결
curl -N "http://localhost:3000/notifications/stream?userId=user-1" \
  -H "Last-Event-Id: 3"
# id가 3보다 큰 pending 알림이 즉시 재전송되면 정상
```

**4. 브라우저 대시보드 (`http://localhost:5173`)**

| 순서 | 동작 | 확인 포인트 |
|------|------|------------|
| 1 | userId 입력 → 연결 버튼 | 상단에 `connected` 상태 표시 |
| 2 | 제목 입력 → 발송 | "실시간 수신" 영역에 즉시 표시, 목록 `delivered` 상태 |
| 3 | 알림 항목 읽음 버튼 클릭 | 해당 항목 `read` 상태로 전환 |
| 4 | "전체 브로드캐스트" 체크 → 발송 | 연결된 모든 userId에 수신 |
| 5 | 탭 두 개에서 같은 userId로 연결 후 발송 | 두 탭 모두 수신 (멀티탭 지원 검증) |

**5. 유닛 테스트**

```bash
npm test
```

---

## 다중 인스턴스 검증

서버 A에 연결된 클라이언트가 서버 B로 들어온 요청의 알림을 수신하는 시나리오입니다.

```bash
# 서버 2개 + nginx 실행
docker-compose -f docker-compose.scale.yml up --build

# 서버 A(nginx 경유)에 SSE 연결
curl -N "http://localhost/notifications/stream?userId=user-1"

# 별도 터미널 — 서버 B(포트 3001)로 직접 발송
curl -X POST http://localhost:3001/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","title":"서버 B에서 발송"}'

# 첫 번째 터미널에서 알림 수신 확인 → Redis Pub/Sub 정상 동작
```

---

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/notifications/stream?userId=` | SSE 연결 |
| `POST` | `/notifications` | 알림 발송 (userId 또는 broadcast) |
| `GET` | `/notifications?userId=` | 알림 목록 조회 |
| `PATCH` | `/notifications/:id/read` | 읽음 처리 |

---

## 한계와 다음 단계

**Redis Stream 교체**: Pub/Sub은 메시지 영속성이 없습니다. Redis Stream + Consumer Group으로 바꾸면 전달 보장이 훨씬 확실해집니다.

**수평 확장 시 ref-counting**: 각 서버가 ref-count를 따로 관리하다 보니, 서버가 죽으면 구독이 그대로 남습니다. Redis 중앙 카운터를 두는 방식으로 해결할 수 있습니다.

**인증**: 지금은 userId를 쿼리 파라미터로 그냥 받습니다. 실제로 쓴다면 JWT가 필요합니다.
