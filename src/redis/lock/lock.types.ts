// src/redis/lock/lock.types.ts
export class LockAcquisitionError extends Error {
  constructor(key?: string) {
    super(key ? `락 획득 실패: ${key}` : '락 획득 실패');
    this.name = 'LockAcquisitionError';
    Object.setPrototypeOf(this, LockAcquisitionError.prototype);
  }
}
