import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PUBLISHER } from '../../../redis/redis.constants';

@Injectable()
export class ProductCacheRepository {
  constructor(@Inject(REDIS_PUBLISHER) private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttl);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.redis.del(...keys);
  }

  async hset(hash: string, field: string, value: string): Promise<void> {
    await this.redis.hset(hash, field, value);
  }

  async hgetall(hash: string): Promise<Record<string, string>> {
    return this.redis.hgetall(hash);
  }

  async hdel(hash: string, ...fields: string[]): Promise<void> {
    if (fields.length > 0) await this.redis.hdel(hash, ...fields);
  }
}
