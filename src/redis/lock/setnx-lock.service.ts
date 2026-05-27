import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_PUBLISHER } from '../redis.constants';
import { LockHandle, LockService } from './lock.interface';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class SetnxLockService extends LockService {
  constructor(
    @Inject(REDIS_PUBLISHER) private readonly redis: Redis,
    private readonly maxWaitMs = 3000,
    private readonly initialDelayMs = 50,
  ) {
    super();
  }

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    const deadline = Date.now() + this.maxWaitMs;
    let delay = this.initialDelayMs;

    while (Date.now() < deadline) {
      const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') return { key, token };

      await sleep(delay);
      delay = Math.min(delay * 2, 500);
    }

    return null;
  }

  async release(handle: LockHandle): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, handle.key, handle.token);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
