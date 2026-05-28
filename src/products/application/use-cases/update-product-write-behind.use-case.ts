import { Injectable } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
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

    // 기존 캐시가 있을 때만 완전한 객체로 병합하여 갱신 (partial 저장 방지)
    const key = CACHE_KEY.product(id);
    try {
      const existing = await this.cache.get(key);
      if (existing) {
        const current = JSON.parse(existing) as Product;
        const patch = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        await this.cache.set(
          key,
          JSON.stringify({ ...current, ...patch }),
          CACHE_TTL.product,
        );
        this.metrics.emit(CACHE_EVENT.redisSet, { key, ttl: CACHE_TTL.product });
      }
    } catch {
      // 캐시 갱신 실패 시 큐 등록은 유지
    }

    return { queued: true };
  }
}
