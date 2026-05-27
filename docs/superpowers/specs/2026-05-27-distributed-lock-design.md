# 분산 락 (Distributed Lock) 구현 설계

**작성일**: 2026-05-27  
**범위**: Redis 학습 프로젝트 2단계 — 선착순 쿠폰 발급 시나리오  
**목표**: SETNX 직접 구현 → redlock 전환 비교, 동시성 테스트, 데드락 시나리오 재현

---

## 1. 모듈 구조

```
src/redis/
  redis.module.ts              # 기존 publisher/subscriber + lock 서비스 export 추가
  redis.constants.ts           # SETNX_LOCK, REDLOCK 상수 추가
  lock/
    lock.interface.ts          # LockService 추상 인터페이스
    lock.types.ts              # LockHandle, LockAcquisitionError 타입
    setnx-lock.service.ts      # SETNX 직접 구현체
    redlock-lock.service.ts    # redlock 라이브러리 구현체

src/coupons/
  domain/
    entities/coupon.ts
    entities/issued-coupon.ts
    repositories/coupon.repository.ts
    repositories/issued-coupon.repository.ts
  application/
    use-cases/
      issue-coupon.use-case.ts    # LockService 주입받아 발급 처리
      seed-coupons.use-case.ts    # 초기 데이터 생성
  infrastructure/
    persistence/
      coupon.entity.ts
      coupon.repository.impl.ts
      issued-coupon.entity.ts
      issued-coupon.repository.impl.ts
  presentation/
    coupons.controller.ts
  coupons.module.ts
```

---

## 2. 도메인 모델

### Coupon
```typescript
class Coupon {
  id: string
  name: string      // 쿠폰명 (예: "선착순 100명 할인 쿠폰")
  stock: number     // 남은 재고 (초기값: maxCount)
  maxCount: number  // 최대 발급 수
}
```

### IssuedCoupon
```typescript
class IssuedCoupon {
  id: string
  couponId: string
  userId: string
  issuedAt: Date
}
```

IssuedCoupon을 별도 테이블로 분리하는 이유: `COUNT(*)` 쿼리로 동시성 테스트 결과를 명확하게 검증할 수 있음 (예: "정확히 100개만 발급됐는가").

---

## 3. 락 인터페이스

```typescript
// src/redis/lock/lock.interface.ts
export interface LockHandle {
  key: string
  token: string
}

export abstract class LockService {
  abstract acquire(key: string, ttlMs: number): Promise<LockHandle | null>
  abstract release(handle: LockHandle): Promise<void>
}
```

### 3-1. SetnxLockService (SETNX 직접 구현)

**획득**: `SET coupon:lock:{key} {uuid} NX PX {ttlMs}`  
**해제**: Lua 스크립트로 원자적 처리 (자신의 uuid인지 확인 후 삭제)

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

**재시도 전략**: exponential backoff (50ms → 100ms → 200ms → ...)  
최대 대기 시간(기본 3000ms) 초과 시 `LockAcquisitionError` throw

**SETNX의 한계 (학습 포인트)**:
- watchdog 없음: 작업 시간이 TTL 초과하면 락이 풀려 두 프로세스가 동시 진입 가능
- 서버 사망 시: TTL 만료까지 해당 리소스 잠금
- 분산 환경 clock skew: 단일 Redis 인스턴스에서만 안전

### 3-2. RedlockLockService (redlock 라이브러리)

패키지: `redlock` (Antirez가 설계한 Redlock 알고리즘 Node.js 구현)

```typescript
import Redlock from 'redlock'
```

SETNX 직접 구현 대비 장점:
- unlock race condition 내부 처리
- `ExecutionError`로 명확한 에러 구분
- 멀티 Redis 인스턴스 quorum 기반 락 (단일 인스턴스에서도 동작)

---

## 4. 쿠폰 발급 흐름

```typescript
// IssueCouponUseCase
async execute(couponId: string, userId: string): Promise<IssuedCoupon> {
  const handle = await this.lockService.acquire(`coupon:${couponId}`, 5000)
  if (!handle) throw new LockAcquisitionError()

  try {
    const coupon = await this.couponRepo.findById(couponId)
    if (coupon.stock <= 0) throw new CouponExhaustedException()

    coupon.stock--
    await this.couponRepo.save(coupon)

    return await this.issuedCouponRepo.create({ couponId, userId })
  } finally {
    await this.lockService.release(handle)
  }
}
```

`finally` 블록으로 항상 락 해제 → 예외 발생 시에도 락이 남지 않음.

---

## 5. API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/coupons/seed` | 테스트용 쿠폰 생성 (stock: 100) |
| `POST` | `/coupons/:id/issue` | 쿠폰 발급 (userId body) |
| `GET`  | `/coupons/:id/issued-count` | 발급 건수 조회 (동시성 검증용) |

---

## 6. 테스트 전략

### 통합 테스트 (`test/coupons-lock.e2e-spec.ts`)
실제 Redis + PostgreSQL 연결. `Promise.all`로 동시 요청 시뮬레이션.

```
describe('동시 1000명 쿠폰 발급 — 락 없음')
  it('stock이 0 미만으로 내려간다 (race condition 재현)')

describe('동시 1000명 쿠폰 발급 — SETNX 락')
  it('발급 건수가 정확히 100개다')
  it('stock이 정확히 0이다')

describe('동시 1000명 쿠폰 발급 — redlock')
  it('발급 건수가 정확히 100개다')
  it('stock이 정확히 0이다')

describe('데드락 시나리오')
  it('락 보유 중 예외 발생 → TTL 후 다음 요청이 락 획득 성공')
  it('finally 블록이 항상 실행되어 락 해제됨')

describe('SETNX vs redlock 비교')
  it('SETNX: 락 TTL 초과 시 stock 초과 발급 가능 (watchdog 없음)')
  it('redlock: ExecutionError로 명확한 실패 구분')
```

---

## 7. 설치 패키지

```bash
npm install redlock
```

---

## 8. 구현 순서

1. `redis/lock/` 인터페이스 + SetnxLockService 구현
2. `coupons/` 도메인 엔티티 + 리포지토리
3. `IssueCouponUseCase` + CouponsModule (SetnxLockService 주입)
4. 통합 테스트 — 락 없음 vs SETNX 비교 확인
5. RedlockLockService 구현 + CouponsModule 전환
6. 동일 테스트로 SETNX vs redlock 결과 비교
7. 데드락 시나리오 테스트 추가
