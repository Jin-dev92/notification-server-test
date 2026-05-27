// src/redis/lock/lock.interface.ts
export interface LockHandle {
  key: string;
  token: string;
}

export abstract class LockService {
  abstract acquire(key: string, ttlMs: number): Promise<LockHandle | null>;
  abstract release(handle: LockHandle): Promise<void>;
}
