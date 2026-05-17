import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../redis/redis.module';
import { CacheMetricsSseService } from './application/services/cache-metrics-sse.service';
import { CacheMetricsService } from './application/services/cache-metrics.service';
import { WriteBehindFlusherService } from './application/services/write-behind-flusher.service';
import { GetProductByIdUseCase } from './application/use-cases/get-product-by-id.use-case';
import { GetProductsCacheAsideUseCase } from './application/use-cases/get-products-cache-aside.use-case';
import { GetProductsUseCase } from './application/use-cases/get-products.use-case';
import { SeedProductsUseCase } from './application/use-cases/seed-products.use-case';
import { UpdateProductWriteBehindUseCase } from './application/use-cases/update-product-write-behind.use-case';
import { UpdateProductWriteThroughUseCase } from './application/use-cases/update-product-write-through.use-case';
import { ProductRepository } from './domain/repositories/product.repository';
import { ProductCacheRepository } from './infrastructure/cache/product-cache.repository';
import { ProductEntity } from './infrastructure/persistence/product.entity';
import { ProductRepositoryImpl } from './infrastructure/persistence/product.repository.impl';
import { ProductsController } from './presentation/products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity]), RedisModule],
  controllers: [ProductsController],
  providers: [
    ProductRepositoryImpl,
    { provide: ProductRepository, useClass: ProductRepositoryImpl },
    ProductCacheRepository,
    CacheMetricsSseService,
    CacheMetricsService,
    WriteBehindFlusherService,
    GetProductsUseCase,
    GetProductsCacheAsideUseCase,
    GetProductByIdUseCase,
    UpdateProductWriteThroughUseCase,
    UpdateProductWriteBehindUseCase,
    SeedProductsUseCase,
  ],
})
export class ProductsModule {}
