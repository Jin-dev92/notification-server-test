import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import {
  CACHE_EVENT,
  CACHE_KEY,
  CACHE_STRATEGY,
  CACHE_TTL,
} from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';

@Injectable()
export class GetProductByIdUseCase {
  constructor(
    private readonly repo: ProductRepository,
    private readonly cache: ProductCacheRepository,
    private readonly metrics: CacheMetricsService,
  ) {}

  async execute(id: number): Promise<Product> {
    const start = Date.now();
    const key = CACHE_KEY.product(id);
    const cached = await this.cache.get(key);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Product;
        parsed.createdAt = new Date(parsed.createdAt);
        parsed.updatedAt = new Date(parsed.updatedAt);
        this.metrics.emit(CACHE_EVENT.cacheHit, {
          strategy: CACHE_STRATEGY.cacheAside,
          key,
          latencyMs: Date.now() - start,
        });
        return parsed;
      } catch {
        // 캐시 파싱 실패 시 DB에서 재조회
      }
    }

    this.metrics.emit(CACHE_EVENT.cacheMiss, {
      strategy: CACHE_STRATEGY.cacheAside,
      key,
    });

    const dbStart = Date.now();
    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    this.metrics.emit(CACHE_EVENT.dbRead, {
      strategy: CACHE_STRATEGY.cacheAside,
      id,
      latencyMs: Date.now() - dbStart,
    });

    try {
      await this.cache.set(key, JSON.stringify(product), CACHE_TTL.product);
      this.metrics.emit(CACHE_EVENT.redisSet, { key, ttl: CACHE_TTL.product });
    } catch {
      // Redis 쓰기 실패 시 DB 결과를 그대로 반환
    }

    return product;
  }
}
