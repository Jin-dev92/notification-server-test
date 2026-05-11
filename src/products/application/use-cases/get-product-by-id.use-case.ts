import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { CACHE_KEY } from '../../constants/product-cache.constants';
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
      this.metrics.emit('cache_hit', {
        key,
        latencyMs: Date.now() - start,
      });
      return JSON.parse(cached) as Product;
    }

    this.metrics.emit('cache_miss', { key });

    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    this.metrics.emit('db_read', { id });
    return product;
  }
}
