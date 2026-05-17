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

describe('UpdateProductWriteBehindUseCase', () => {
  let useCase: UpdateProductWriteBehindUseCase;
  let cache: { hset: jest.Mock; set: jest.Mock };
  let metrics: { emit: jest.Mock };

  beforeEach(async () => {
    cache = { hset: jest.fn(), set: jest.fn() };
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
    cache.set.mockResolvedValue(undefined);

    const result = await useCase.execute(PRODUCT_ID, data);

    expect(result).toEqual({ queued: true });
    expect(cache.hset).toHaveBeenCalledWith(
      CACHE_KEY.writeBehindPending,
      String(PRODUCT_ID),
      JSON.stringify(data),
    );
  });

  it('상품 캐시를 변경된 데이터로 즉시 갱신한다', async () => {
    const data: UpdateProductData = { price: 20000 };
    cache.hset.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);

    await useCase.execute(PRODUCT_ID, data);

    expect(cache.set).toHaveBeenCalledWith(
      CACHE_KEY.product(PRODUCT_ID),
      JSON.stringify({ id: PRODUCT_ID, ...data }),
      CACHE_TTL.product,
    );
  });

  it('flushQueued → redisSet 순서로 메트릭을 emit한다', async () => {
    const data: UpdateProductData = { stock: 10 };
    cache.hset.mockResolvedValue(undefined);
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
});
