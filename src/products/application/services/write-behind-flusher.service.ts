import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { CACHE_KEY } from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from './cache-metrics.service';

const FLUSH_INTERVAL_MS = 5_000;

@Injectable()
export class WriteBehindFlusherService implements OnModuleInit, OnModuleDestroy {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPaused = false;

  constructor(
    private readonly repo: ProductRepository,
    private readonly cache: ProductCacheRepository,
    private readonly metrics: CacheMetricsService,
  ) {}

  onModuleInit(): void {
    this.intervalId = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  private async flush(): Promise<void> {
    if (this.isPaused) return;

    const pending = await this.cache.hgetall(CACHE_KEY.writeBehindPending);
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    for (const id of ids) {
      try {
        await this.repo.update(+id, JSON.parse(pending[id]));
        this.metrics.emit('db_write', { id, strategy: 'write-behind' });
        this.metrics.emit('flush_succeeded', { id });
      } catch {
        // 실패한 id는 wb:pending에 남겨 다음 flush에서 재시도
      }
    }

    await this.cache.hdel(CACHE_KEY.writeBehindPending, ...ids);
    await this.cache.del(CACHE_KEY.productsList);
    this.metrics.emit('invalidate', { key: CACHE_KEY.productsList });
  }
}
