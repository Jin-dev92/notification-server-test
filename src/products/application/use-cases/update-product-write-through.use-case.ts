import { Injectable } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import {
  ProductRepository,
  UpdateProductData,
} from '../../domain/repositories/product.repository';
import {
  CACHE_EVENT,
  CACHE_KEY,
  CACHE_STRATEGY,
  CACHE_TTL,
} from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';

@Injectable()
export class UpdateProductWriteThroughUseCase {
  constructor(
    private readonly repo: ProductRepository,
    private readonly cache: ProductCacheRepository,
    private readonly metrics: CacheMetricsService,
  ) {}

  async execute(id: number, data: UpdateProductData): Promise<Product> {
    const updated = await this.repo.update(id, data);
    this.metrics.emit(CACHE_EVENT.dbWrite, {
      id,
      strategy: CACHE_STRATEGY.writeThrough,
    });

    const key = CACHE_KEY.product(id);
    await this.cache.set(key, JSON.stringify(updated), CACHE_TTL.product);
    this.metrics.emit(CACHE_EVENT.redisSet, { key, ttl: CACHE_TTL.product });

    await this.cache.del(CACHE_KEY.productsList);
    this.metrics.emit(CACHE_EVENT.invalidate, { key: CACHE_KEY.productsList });

    return updated;
  }
}
