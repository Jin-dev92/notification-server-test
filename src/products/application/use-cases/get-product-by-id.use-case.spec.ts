import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import {
  CACHE_EVENT,
  CACHE_KEY,
} from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';
import { GetProductByIdUseCase } from './get-product-by-id.use-case';

const PRODUCT_ID = 1;

function createMockProduct(): Product {
  const p = new Product();
  p.id = PRODUCT_ID;
  p.name = '캐시 테스트 상품';
  p.price = 10000;
  p.stock = 50;
  p.createdAt = new Date('2026-01-01T00:00:00.000Z');
  p.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return p;
}

describe('GetProductByIdUseCase', () => {
  let useCase: GetProductByIdUseCase;
  let repo: { findById: jest.Mock };
  let cache: { get: jest.Mock };
  let metrics: { emit: jest.Mock };

  beforeEach(async () => {
    repo = { findById: jest.fn() };
    cache = { get: jest.fn() };
    metrics = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetProductByIdUseCase,
        { provide: ProductRepository, useValue: repo },
        { provide: ProductCacheRepository, useValue: cache },
        { provide: CacheMetricsService, useValue: metrics },
      ],
    }).compile();

    useCase = module.get(GetProductByIdUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cache hit', () => {
    it('캐시에 상품이 있으면 DB를 조회하지 않고 캐시 데이터를 반환한다', async () => {
      const product = createMockProduct();
      const serialized = JSON.stringify(product);
      cache.get.mockResolvedValue(serialized);

      const result = await useCase.execute(PRODUCT_ID);

      expect(result).toEqual(JSON.parse(serialized));
      expect(repo.findById).not.toHaveBeenCalled();
      expect(metrics.emit).toHaveBeenCalledWith(
        CACHE_EVENT.cacheHit,
        expect.objectContaining({ key: CACHE_KEY.product(PRODUCT_ID) }),
      );
    });
  });

  describe('cache miss', () => {
    it('캐시에 없고 DB에 상품이 있으면 DB 조회 후 반환한다', async () => {
      const product = createMockProduct();
      cache.get.mockResolvedValue(null);
      repo.findById.mockResolvedValue(product);

      const result = await useCase.execute(PRODUCT_ID);

      expect(result).toEqual(product);
      expect(repo.findById).toHaveBeenCalledWith(PRODUCT_ID);
      expect(metrics.emit).toHaveBeenCalledWith(
        CACHE_EVENT.cacheMiss,
        expect.objectContaining({ key: CACHE_KEY.product(PRODUCT_ID) }),
      );
      expect(metrics.emit).toHaveBeenCalledWith(
        CACHE_EVENT.dbRead,
        expect.objectContaining({ id: PRODUCT_ID }),
      );
    });

    it('캐시에 없고 DB에도 없으면 NotFoundException을 던진다', async () => {
      cache.get.mockResolvedValue(null);
      repo.findById.mockResolvedValue(null);

      await expect(useCase.execute(999)).rejects.toThrow(NotFoundException);
    });
  });
});
