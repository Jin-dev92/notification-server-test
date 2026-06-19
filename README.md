# Redis 실무 패턴 연습 — 실시간 알림 · 분산 락 · 캐싱

기능 구현 자체보다, **"왜 이 방식을 골랐는가"** 를 검증하려고 만든 프로젝트다.
실시간 알림(SSE), 선착순 쿠폰(분산 락), 상품 조회(캐싱)라는 현실적인 시나리오 위에서
Redis의 대표 패턴들을 직접 구현하고, 각 선택의 트레이드오프를 코드로 확인했다.

전체 모듈은 **DDD/레이어드 구조**(`domain → application → infrastructure → presentation`)로 나눴다.
도메인이 Redis·TypeORM 같은 인프라를 모르게 해서, 락 구현(SETNX↔Redlock)이나 캐시 백엔드를 갈아끼워도
유스케이스 코드는 손대지 않는다.

```
src/
├── coupons/        ← 선착순 쿠폰 발급 (분산 락)
├── products/       ← 상품 조회/수정 (캐싱 전략 3종 + 캐시 동작 SSE 관측)
├── notifications/  ← 실시간 알림 (SSE + Pub/Sub fan-out, 놓친 알림 복구)
├── redis/lock/     ← LockService 추상화 + SETNX·Redlock 구현
└── sse/            ← SSE 연결 관리(인메모리 Subject 맵)
```

---

## 1. 분산 락 — SETNX 직접 구현 vs Redlock

선착순 쿠폰(재고 100개에 동시 요청 1000개)에서 **초과 발급**을 막는 게 목표다.
`LockService` 추상 인터페이스를 두고 **두 가지 구현을 모두** 만들어 비교했다. 쿠폰 유스케이스는
추상 인터페이스에만 의존하므로 구현 교체에 코드 변경이 없다.

### SETNX 직접 구현
```
SET key {uuid-token} PX {ttl} NX   // 락 획득
```
- 소유권을 **UUID 토큰**으로 표시하고, **해제는 Lua 스크립트로 원자 처리**한다.
  ```lua
  if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end
  ```
  `get` 으로 확인하고 `del` 하는 2단계로 풀면, 그 사이에 내 락이 TTL로 만료되고 다른 요청이
  같은 키로 락을 새로 잡았을 때 **남의 락을 지워버리는** race가 생긴다. Lua로 묶어 "내 토큰일 때만 삭제"를 원자화했다.
- 획득 실패 시 **지수 백오프**(50ms→최대 500ms, 전체 대기 3s)로 재시도한다.

### Redlock
- 라이브러리(`redlock`) 사용. `driftFactor`·`retryCount`·`retryJitter`로 클럭 드리프트와 재시도를 다룬다.

### 트레이드오프
- **SETNX 단일 노드**는 단순·저지연이지만, Redis 마스터가 죽고 복제가 지연된 순간 **락이 중복 획득**될 수 있다.
- **Redlock**은 다중 노드 합의로 그 위험을 줄이지만 구현·지연 비용이 더 크다(단일 노드에선 이점이 거의 없다).
- 이 프로젝트는 단일 Redis라 실무적으론 SETNX로 충분하지만, **두 방식의 코드를 같이 두고 차이를 체득**하는 게 목적이었다.

---

## 2. 캐싱 전략 — Cache-Aside / Write-Through / Write-Behind

상품 도메인에서 세 가지 쓰기/읽기 전략을 모두 구현하고, 같은 시나리오에서 어떻게 다른지 비교했다.

| 전략 | 동작 | 트레이드오프 |
|------|------|--------------|
| **Cache-Aside** | 읽기: Redis 먼저, 미스면 DB 조회 후 캐시 적재 | 읽기 최적화. 첫 요청은 미스 비용 |
| **Write-Through** | 쓰기: DB와 캐시를 **동시 갱신** | 정합성↑. 매 쓰기에 캐시 갱신 비용 |
| **Write-Behind** | 쓰기: Redis 큐에 적재 후 **즉시 반환**, 주기 배치로 DB 반영 | 쓰기 지연·DB 부하↓, 대신 flush 전 장애 시 **유실 위험** |

### Write-Behind 구현 디테일
- 변경분을 Redis 해시(`wb:pending`)에 쌓고 `{ queued: true }` 로 즉시 응답한다.
- `WriteBehindFlusherService` 가 **5초 간격**으로 모아서 DB에 일괄 반영한다.
- **실패한 id는 큐에 남겨 다음 flush에서 재시도**하고, 성공분만 큐에서 제거 후 캐시를 무효화한다.
- 캐시에 기존 객체가 있을 때만 patch를 병합해 갱신(부분 저장 방지)한다.

### 캐시 동작을 눈으로 — 메트릭 SSE
캐시 히트/미스, flush 큐잉, DB 쓰기, 무효화 이벤트를 `cache-metrics` 로 모아 **SSE로 실시간 스트리밍**한다.
"지금 캐시가 실제로 어떻게 동작하는지"를 관찰하려는 학습용 장치다.

---

## 3. 실시간 알림 — SSE + Redis Pub/Sub fan-out

알림 전달은 SSE로 한다. 서버는 사용자별 SSE 연결을 **인메모리 Subject 맵**으로 들고 있다가 푸시한다.

### 핵심 문제: SSE 연결은 특정 인스턴스에 묶인다
서버를 2대 이상으로 띄우면(`docker-compose.scale.yml`: app1·app2·nginx),
**app2가 받은 발송 요청이 app1에 연결된 사용자에게 닿지 않는다.** 연결과 발송이 다른 프로세스에 있기 때문이다.

### 해결: Redis Pub/Sub으로 인스턴스 간 중계
- 발송은 DB 저장 후 **Redis 채널에 publish** 만 한다.
- 모든 인스턴스가 채널을 **subscribe** 하고, 메시지를 받으면 **자기에게 연결된 사용자에게만** emit 한다(`hasConnection` 체크).
- 결과적으로 **어느 서버에서 발송하든 모든 인스턴스로 fan-out** 된다.

### 설계 디테일
- **publisher/subscriber 커넥션 분리**: ioredis는 subscribe 모드에 들어가면 일반 명령을 못 쓴다. 그래서 발행용·구독용 커넥션을 따로 둔다.
- **채널 분리**: 전체 방송(`notification:broadcast`)과 사용자별 채널(`notification:user:{id}`)을 나눈다.
- **유저 채널 ref-count**: 같은 사용자가 여러 탭을 열어도 채널 구독은 1개만 유지하고, 마지막 연결이 끊길 때만 구독 해제한다.

---

## 4. 놓친 알림 복구 — SSE Last-Event-ID 재연결

SSE는 연결이 끊기면 브라우저가 마지막으로 받은 이벤트 id를 `Last-Event-ID` 헤더로 보내며 자동 재연결한다.
서버는 그 id **이후의 놓친 알림을 조회해 먼저 흘려보낸 뒤**, 실시간 스트림을 이어 붙인다(`concat(reconnect$, live$)`).
끊긴 동안의 알림이 유실되지 않는다. 프록시 타임아웃 방지를 위해 주기적 `ping` 이벤트도 함께 보낸다.

### 알림 상태 머신
`PENDING`(생성) → `DELIVERED`(SSE 전달 성공 / 재연결 복구) → `READ`(읽음).
실제 emit이 성공한 시점에 DELIVERED로 전이해, "발송했지만 못 받은" 상태를 구분한다.

---

## 기술 스택

| | |
|--|--|
| Framework | NestJS |
| DB | PostgreSQL + TypeORM |
| Cache / Pub-Sub / Lock | Redis (ioredis), redlock |
| 실시간 | SSE(Server-Sent Events) |
| 스케일 검증 | Docker Compose(app×2 + nginx) |
| Docs | Swagger |
| Test | Jest |
| Client | React(Vite) — SSE 수신 데모 |

---

## 실행 방법

```bash
# 인프라 + 단일 서버
docker-compose up -d
npm run start:dev          # http://localhost:3000 (Swagger: /api-docs)

# 멀티 인스턴스(Pub/Sub fan-out 검증) — app1·app2·nginx
docker-compose -f docker-compose.scale.yml up --build
#   SSE 연결(nginx→app1):  curl -N http://localhost/notifications/stream?userId=user1
#   서버B에서 발송(app2):   curl -X POST http://localhost:3001/notifications \
#                            -H "Content-Type: application/json" \
#                            -d '{"userId":"user1","title":"서버B에서 발송"}'
#   → app1에 연결된 user1이 받으면 fan-out 성공

npm test                   # 단위 테스트
npm run test:e2e           # e2e (쿠폰 분산 락 동시성 포함)
```

---

## 더 해볼 것
- Rate Limiting(고정/슬라이딩 윈도우), Session Storage, Redis Stream 기반 소비 그룹
- 분산 락의 멀티 노드 Redlock 실측, 캐시 쇄도(stampede) 대응 비교
