import { Injectable } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { CACHE_KEY, CACHE_TTL } from '../../constants/product-cache.constants';
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
      this.metrics.emit('cache_hit', {
        strategy: 'cache-aside',
        key: CACHE_KEY.productsList,
        latencyMs: Date.now() - start,
      });
      return JSON.parse(cached) as Product[];
    }

    this.metrics.emit('cache_miss', {
      strategy: 'cache-aside',
      key: CACHE_KEY.productsList,
    });

    const products = await this.repo.findAll();
    this.metrics.emit('db_read', {
      strategy: 'cache-aside',
      count: products.length,
    });

    await this.cache.set(
      CACHE_KEY.productsList,
      JSON.stringify(products),
      CACHE_TTL.productsList,
    );
    this.metrics.emit('redis_set', {
      key: CACHE_KEY.productsList,
      ttl: CACHE_TTL.productsList,
    });

    return products;
  }
}
