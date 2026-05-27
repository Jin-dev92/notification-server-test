import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_PUBLISHER } from '../redis.constants';
import { SetnxLockService } from './setnx-lock.service';

describe('SetnxLockService', () => {
  let service: SetnxLockService;
  let redis: { set: jest.Mock; eval: jest.Mock };

  beforeEach(async () => {
    redis = { set: jest.fn(), eval: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: REDIS_PUBLISHER, useValue: redis },
      ],
    }).compile();

    // 테스트에서 maxWaitMs를 200ms로 단축해 타임아웃 케이스를 빠르게 검증
    service = new SetnxLockService(module.get(REDIS_PUBLISHER), 200, 20);
  });

  afterEach(() => jest.clearAllMocks());

  it('Redis SET NX 성공 시 LockHandle을 반환한다', async () => {
    redis.set.mockResolvedValue('OK');
    const handle = await service.acquire('test:key', 5000);
    expect(handle).not.toBeNull();
    expect(handle!.key).toBe('test:key');
    expect(handle!.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('Redis SET NX 항상 실패 시 null을 반환한다 (타임아웃)', async () => {
    redis.set.mockResolvedValue(null);
    const handle = await service.acquire('test:key', 5000);
    expect(handle).toBeNull();
  }, 10000);

  it('재시도 후 락 획득 성공 시 handle을 반환한다', async () => {
    redis.set
      .mockResolvedValueOnce(null) // 1차 실패
      .mockResolvedValueOnce(null) // 2차 실패
      .mockResolvedValue('OK');    // 3차 성공
    const handle = await service.acquire('test:key', 5000);
    expect(handle).not.toBeNull();
    expect(redis.set).toHaveBeenCalledTimes(3);
  });

  it('release 시 Lua 스크립트로 원자적 unlock을 실행한다', async () => {
    redis.eval.mockResolvedValue(1);
    await service.release({ key: 'test:key', token: 'my-uuid' });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'test:key',
      'my-uuid',
    );
  });
});
