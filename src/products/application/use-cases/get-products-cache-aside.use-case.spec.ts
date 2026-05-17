import { Test, TestingModule } from '@nestjs/testing';
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
import { GetProductsCacheAsideUseCase } from './get-products-cache-aside.use-case';

function createMockProduct(id: number): Product {
  const p = new Product();
  p.id = id;
  p.name = `상품 ${id}`;
  p.price = 1000;
  p.stock = 100;
  p.createdAt = new Date('2026-01-01T00:00:00.000Z');
  p.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return p;
}

describe('GetProductsCacheAsideUseCase', () => {
  let useCase: GetProductsCacheAsideUseCase;
  let repo: { findAll: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let metrics: { emit: jest.Mock };

  beforeEach(async () => {
    repo = { findAll: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    metrics = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetProductsCacheAsideUseCase,
        { provide: ProductRepository, useValue: repo },
        { provide: ProductCacheRepository, useValue: cache },
        { provide: CacheMetricsService, useValue: metrics },
      ],
    }).compile();

    useCase = module.get(GetProductsCacheAsideUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cache hit', () => {
    it('캐시에 데이터가 있으면 DB를 조회하지 않고 반환한다', async () => {
      const products = [createMockProduct(1), createMockProduct(2)];
      const serialized = JSON.stringify(products);
      cache.get.mockResolvedValue(serialized);

      const result = await useCase.execute();

      expect(result).toEqual(JSON.parse(serialized));
      expect(repo.findAll).not.toHaveBeenCalled();
      expect(metrics.emit).toHaveBeenCalledWith(
        CACHE_EVENT.cacheHit,
        expect.objectContaining({
          strategy: CACHE_STRATEGY.cacheAside,
          key: CACHE_KEY.productsList,
        }),
      );
    });
  });

  describe('cache miss', () => {
    it('캐시에 없으면 DB를 조회하고 결과를 캐시에 저장한다', async () => {
      const products = [createMockProduct(1)];
      cache.get.mockResolvedValue(null);
      cache.set.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue(products);

      const result = await useCase.execute();

      expect(result).toEqual(products);
      expect(repo.findAll).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith(
        CACHE_KEY.productsList,
        JSON.stringify(products),
        CACHE_TTL.productsList,
      );
    });

    it('DB 조회 후 cacheMiss → dbRead → redisSet 순서로 메트릭을 emit한다', async () => {
      const products = [createMockProduct(1)];
      cache.get.mockResolvedValue(null);
      cache.set.mockResolvedValue(undefined);
      repo.findAll.mockResolvedValue(products);

      await useCase.execute();

      const calls = metrics.emit.mock.calls.map(([event]) => event);
      expect(calls).toEqual([
        CACHE_EVENT.cacheMiss,
        CACHE_EVENT.dbRead,
        CACHE_EVENT.redisSet,
      ]);
      expect(metrics.emit).toHaveBeenCalledWith(
        CACHE_EVENT.redisSet,
        expect.objectContaining({
          key: CACHE_KEY.productsList,
          ttl: CACHE_TTL.productsList,
        }),
      );
    });
  });
});
