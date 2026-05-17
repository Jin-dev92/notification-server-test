import { Test, TestingModule } from '@nestjs/testing';
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
import { UpdateProductWriteThroughUseCase } from './update-product-write-through.use-case';

const PRODUCT_ID = 1;

function createMockProduct(overrides?: Partial<Product>): Product {
  const p = new Product();
  p.id = PRODUCT_ID;
  p.name = '상품';
  p.price = 10000;
  p.stock = 100;
  p.createdAt = new Date('2026-01-01T00:00:00.000Z');
  p.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  Object.assign(p, overrides);
  return p;
}

describe('UpdateProductWriteThroughUseCase', () => {
  let useCase: UpdateProductWriteThroughUseCase;
  let repo: { update: jest.Mock };
  let cache: { set: jest.Mock; del: jest.Mock };
  let metrics: { emit: jest.Mock };

  beforeEach(async () => {
    repo = { update: jest.fn() };
    cache = { set: jest.fn(), del: jest.fn() };
    metrics = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateProductWriteThroughUseCase,
        { provide: ProductRepository, useValue: repo },
        { provide: ProductCacheRepository, useValue: cache },
        { provide: CacheMetricsService, useValue: metrics },
      ],
    }).compile();

    useCase = module.get(UpdateProductWriteThroughUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('DB 업데이트 후 상품 캐시를 갱신하고 목록 캐시를 무효화한다', async () => {
    const data: UpdateProductData = { price: 15000 };
    const updated = createMockProduct({ price: 15000 });
    repo.update.mockResolvedValue(updated);
    cache.set.mockResolvedValue(undefined);
    cache.del.mockResolvedValue(undefined);

    const result = await useCase.execute(PRODUCT_ID, data);

    expect(result).toEqual(updated);
    expect(repo.update).toHaveBeenCalledWith(PRODUCT_ID, data);
    expect(cache.set).toHaveBeenCalledWith(
      CACHE_KEY.product(PRODUCT_ID),
      JSON.stringify(updated),
      CACHE_TTL.product,
    );
    expect(cache.del).toHaveBeenCalledWith(CACHE_KEY.productsList);
  });

  it('dbWrite → redisSet → invalidate 순서로 메트릭을 emit한다', async () => {
    const data: UpdateProductData = { stock: 50 };
    repo.update.mockResolvedValue(createMockProduct({ stock: 50 }));
    cache.set.mockResolvedValue(undefined);
    cache.del.mockResolvedValue(undefined);

    await useCase.execute(PRODUCT_ID, data);

    const calls = metrics.emit.mock.calls.map(([event]) => event);
    expect(calls).toEqual([
      CACHE_EVENT.dbWrite,
      CACHE_EVENT.redisSet,
      CACHE_EVENT.invalidate,
    ]);
    expect(metrics.emit).toHaveBeenCalledWith(
      CACHE_EVENT.dbWrite,
      expect.objectContaining({
        id: PRODUCT_ID,
        strategy: CACHE_STRATEGY.writeThrough,
      }),
    );
    expect(metrics.emit).toHaveBeenCalledWith(
      CACHE_EVENT.invalidate,
      expect.objectContaining({ key: CACHE_KEY.productsList }),
    );
  });
});
