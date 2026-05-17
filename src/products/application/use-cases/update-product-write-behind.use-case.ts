import { Injectable } from '@nestjs/common';
import { UpdateProductData } from '../../domain/repositories/product.repository';
import {
  CACHE_EVENT,
  CACHE_KEY,
  CACHE_STRATEGY,
  CACHE_TTL,
} from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';

@Injectable()
export class UpdateProductWriteBehindUseCase {
  constructor(
    private readonly cache: ProductCacheRepository,
    private readonly metrics: CacheMetricsService,
  ) {}

  async execute(
    id: number,
    data: UpdateProductData,
  ): Promise<{ queued: true }> {
    await this.cache.hset(
      CACHE_KEY.writeBehindPending,
      String(id),
      JSON.stringify(data),
    );
    this.metrics.emit(CACHE_EVENT.flushQueued, {
      id,
      strategy: CACHE_STRATEGY.writeBehind,
    });

    const key = CACHE_KEY.product(id);
    await this.cache.set(
      key,
      JSON.stringify({ id, ...data }),
      CACHE_TTL.product,
    );
    this.metrics.emit(CACHE_EVENT.redisSet, { key, ttl: CACHE_TTL.product });

    return { queued: true };
  }
}
