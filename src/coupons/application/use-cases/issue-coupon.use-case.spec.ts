import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LockHandle, LockService } from '../../../redis/lock/lock.interface';
import { Coupon } from '../../domain/entities/coupon';
import { IssuedCoupon } from '../../domain/entities/issued-coupon';
import { CouponRepository } from '../../domain/repositories/coupon.repository';
import { IssuedCouponRepository } from '../../domain/repositories/issued-coupon.repository';
import { IssueCouponUseCase } from './issue-coupon.use-case';

function makeCoupon(stock = 5): Coupon {
  const c = new Coupon();
  c.id = 'coupon-1';
  c.name = '테스트 쿠폰';
  c.stock = stock;
  c.maxCount = 100;
  c.createdAt = new Date();
  return c;
}

function makeIssuedCoupon(): IssuedCoupon {
  const ic = new IssuedCoupon();
  ic.id = 'issued-1';
  ic.couponId = 'coupon-1';
  ic.userId = 'user-1';
  ic.issuedAt = new Date();
  return ic;
}

describe('IssueCouponUseCase', () => {
  let useCase: IssueCouponUseCase;
  let couponRepo: jest.Mocked<CouponRepository>;
  let issuedCouponRepo: jest.Mocked<IssuedCouponRepository>;
  let lockService: jest.Mocked<LockService>;

  beforeEach(async () => {
    couponRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as any;

    issuedCouponRepo = {
      create: jest.fn(),
      countByCouponId: jest.fn(),
      deleteByCouponId: jest.fn(),
    } as any;

    lockService = {
      acquire: jest.fn(),
      release: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueCouponUseCase,
        { provide: CouponRepository, useValue: couponRepo },
        { provide: IssuedCouponRepository, useValue: issuedCouponRepo },
        { provide: LockService, useValue: lockService },
      ],
    }).compile();

    useCase = module.get(IssueCouponUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('성공: 락 획득 → stock 차감 → IssuedCoupon 생성 → 락 해제', async () => {
    const coupon = makeCoupon(5);
    const issued = makeIssuedCoupon();
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };

    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(coupon);
    couponRepo.save.mockResolvedValue({ ...coupon, stock: 4 });
    issuedCouponRepo.create.mockResolvedValue(issued);

    const result = await useCase.execute('coupon-1', 'user-1');

    expect(lockService.acquire).toHaveBeenCalledWith('coupon:lock:coupon-1', 5000);
    expect(couponRepo.save).toHaveBeenCalledWith(expect.objectContaining({ stock: 4 }));
    expect(issuedCouponRepo.create).toHaveBeenCalledWith({ couponId: 'coupon-1', userId: 'user-1' });
    expect(lockService.release).toHaveBeenCalledWith(handle);
    expect(result).toBe(issued);
  });

  it('락 획득 실패(null 반환) 시 ConflictException을 던진다', async () => {
    lockService.acquire.mockResolvedValue(null);
    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow(ConflictException);
    expect(lockService.release).not.toHaveBeenCalled();
  });

  it('stock 소진(stock=0) 시 ConflictException을 던지고 락은 반드시 해제된다', async () => {
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };
    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(makeCoupon(0));

    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow(ConflictException);
    expect(lockService.release).toHaveBeenCalledWith(handle); // finally 블록 확인
  });

  it('DB 오류 발생 시에도 finally로 락이 해제된다', async () => {
    const handle: LockHandle = { key: 'coupon:lock:coupon-1', token: 'uuid' };
    lockService.acquire.mockResolvedValue(handle);
    couponRepo.findById.mockResolvedValue(makeCoupon(5));
    couponRepo.save.mockRejectedValue(new Error('DB connection error'));

    await expect(useCase.execute('coupon-1', 'user-1')).rejects.toThrow('DB connection error');
    expect(lockService.release).toHaveBeenCalledWith(handle);
  });
});
