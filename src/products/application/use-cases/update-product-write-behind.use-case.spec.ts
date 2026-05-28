import { Test, TestingModule } from '@nestjs/testing';
import { UpdateProductData } from '../../domain/repositories/product.repository';
import {
  CACHE_EVENT,
  CACHE_KEY,
  CACHE_STRATEGY,
  CACHE_TTL,
} from '../../constants/product-cache.constants';
import { ProductCacheRepository } from '../../infrastructure/cache/product-cache.repository';
import { CacheMetricsService } from '../services/cache-metrics.service';
import { UpdateProductWriteBehindUseCase } from './update-product-write-behind.use-case';

const PRODUCT_ID = 1;

const CACHED_PRODUCT = {
  id: PRODUCT_ID,
  name: '테스트 상품',
  price: 10000,
  stock: 50,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('UpdateProductWriteBehindUseCase', () => {
  let useCase: UpdateProductWriteBehindUseCase;
  let cache: { hset: jest.Mock; set: jest.Mock; get: jest.Mock };
  let metrics: { emit: jest.Mock };

  beforeEach(async () => {
    cache = { hset: jest.fn(), set: jest.fn(), get: jest.fn() };
    metrics = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateProductWriteBehindUseCase,
        { provide: ProductCacheRepository, useValue: cache },
        { provide: CacheMetricsService, useValue: metrics },
      ],
    }).compile();

    useCase = module.get(UpdateProductWriteBehindUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('변경 사항을 pending 큐에 등록하고 queued: true를 반환한다', async () => {
    const data: UpdateProductData = { price: 20000, stock: 30 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(null);

    const result = await useCase.execute(PRODUCT_ID, data);

    expect(result).toEqual({ queued: true });
    expect(cache.hset).toHaveBeenCalledWith(
      CACHE_KEY.writeBehindPending,
      String(PRODUCT_ID),
      JSON.stringify(data),
    );
  });

  it('캐시에 상품이 있으면 기존 데이터와 병합한 완전한 객체로 캐시를 갱신한다', async () => {
    const data: UpdateProductData = { price: 20000 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(JSON.stringify(CACHED_PRODUCT));
    cache.set.mockResolvedValue(undefined);

    await useCase.execute(PRODUCT_ID, data);

    expect(cache.set).toHaveBeenCalledWith(
      CACHE_KEY.product(PRODUCT_ID),
      JSON.stringify({ ...CACHED_PRODUCT, ...data }),
      CACHE_TTL.product,
    );
  });

  it('undefined 필드는 기존 캐시 값을 유지한다', async () => {
    const data: UpdateProductData = { price: 20000, stock: undefined };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(JSON.stringify(CACHED_PRODUCT));
    cache.set.mockResolvedValue(undefined);

    await useCase.execute(PRODUCT_ID, data);

    const [, serialized] = cache.set.mock.calls[0];
    const merged = JSON.parse(serialized as string);
    expect(merged.stock).toBe(CACHED_PRODUCT.stock);
    expect(merged.price).toBe(20000);
  });

  it('캐시에 상품이 없으면 개별 캐시를 갱신하지 않는다', async () => {
    const data: UpdateProductData = { price: 20000 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(null);

    await useCase.execute(PRODUCT_ID, data);

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('Redis 장애 시에도 queued: true를 반환한다', async () => {
    const data: UpdateProductData = { price: 20000 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await useCase.execute(PRODUCT_ID, data);

    expect(result).toEqual({ queued: true });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('캐시에 상품이 있을 때 flushQueued → redisSet 순서로 메트릭을 emit한다', async () => {
    const data: UpdateProductData = { stock: 10 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(JSON.stringify(CACHED_PRODUCT));
    cache.set.mockResolvedValue(undefined);

    await useCase.execute(PRODUCT_ID, data);

    const calls = metrics.emit.mock.calls.map(([event]) => event);
    expect(calls).toEqual([CACHE_EVENT.flushQueued, CACHE_EVENT.redisSet]);
    expect(metrics.emit).toHaveBeenCalledWith(
      CACHE_EVENT.flushQueued,
      expect.objectContaining({
        id: PRODUCT_ID,
        strategy: CACHE_STRATEGY.writeBehind,
      }),
    );
  });

  it('캐시에 상품이 없을 때 flushQueued 메트릭만 emit한다', async () => {
    const data: UpdateProductData = { stock: 10 };
    cache.hset.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(null);

    await useCase.execute(PRODUCT_ID, data);

    const calls = metrics.emit.mock.calls.map(([event]) => event);
    expect(calls).toEqual([CACHE_EVENT.flushQueued]);
  });
});
