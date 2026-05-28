import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock, { ExecutionError } from 'redlock';
import type { Lock } from 'redlock';
import { REDIS_PUBLISHER } from '../redis.constants';
import { LockHandle, LockService } from './lock.interface';

// redlock의 Lock 객체를 보관해 release 시 사용하는 내부 맵
// (LockHandle 인터페이스를 오염시키지 않기 위해 서비스 내부에서 관리)
@Injectable()
export class RedlockLockService extends LockService implements OnModuleDestroy {
  private readonly redlock: Redlock;
  private readonly activeLocks = new Map<string, Lock>();

  constructor(@Inject(REDIS_PUBLISHER) redis: Redis) {
    super();
    this.redlock = new Redlock([redis], {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 50,
    });
  }

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    try {
      const lock = await this.redlock.acquire([key], ttlMs);
      this.activeLocks.set(lock.value, lock);
      return { key, token: lock.value };
    } catch (e) {
      if (e instanceof ExecutionError) return null;
      throw e;
    }
  }

  async release(handle: LockHandle): Promise<void> {
    const lock = this.activeLocks.get(handle.token);
    if (lock) {
      await lock.release();
      this.activeLocks.delete(handle.token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redlock.quit();
  }
}
