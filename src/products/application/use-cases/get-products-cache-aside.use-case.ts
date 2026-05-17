import { Injectable } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { CACHE_EVENT, CACHE_KEY, CACHE_STRATEGY, CACHE_TTL } from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';

@Injectable()
export class GetProductsCacheAsideUseCase {
  constructor(
    private readonly repo: ProductRepository,
    private readonly cache: ProductCacheRepository,
    private readonly metrics: CacheMetricsService,
  ) {}

  async execute(): Promise<Product[]> {
    const start = Date.now();
    const cached = await this.cache.get(CACHE_KEY.productsList);

    if (cached) {
      this.metrics.emit(CACHE_EVENT.cacheHit, {
        strategy: CACHE_STRATEGY.cacheAside,
        key: CACHE_KEY.productsList,
        latencyMs: Date.now() - start,
      });
      return JSON.parse(cached) as Product[];
    }

    this.metrics.emit(CACHE_EVENT.cacheMiss, {
      strategy: CACHE_STRATEGY.cacheAside,
      key: CACHE_KEY.productsList,
    });

    const products = await this.repo.findAll();
    this.metrics.emit(CACHE_EVENT.dbRead, {
      strategy: CACHE_STRATEGY.cacheAside,
      count: products.length,
    });

    await this.cache.set(
      CACHE_KEY.productsList,
      JSON.stringify(products),
      CACHE_TTL.productsList,
    );
    this.metrics.emit(CACHE_EVENT.redisSet, {
      key: CACHE_KEY.productsList,
      ttl: CACHE_TTL.productsList,
    });

    return products;
  }
}
