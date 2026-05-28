import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Coupon } from '../domain/entities/coupon';
import { IssuedCoupon } from '../domain/entities/issued-coupon';
import { GetIssuedCountUseCase } from '../application/use-cases/get-issued-count.use-case';
import { IssueCouponUseCase } from '../application/use-cases/issue-coupon.use-case';
import { SeedCouponsUseCase } from '../application/use-cases/seed-coupons.use-case';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly issueCoupon: IssueCouponUseCase,
    private readonly seedCoupons: SeedCouponsUseCase,
    private readonly getIssuedCount: GetIssuedCountUseCase,
  ) {}

  @ApiOperation({ summary: '테스트용 쿠폰 생성 (stock: 100)' })
  @Post('seed')
  seed(): Promise<Coupon> {
    return this.seedCoupons.execute();
  }

  @ApiOperation({ summary: '쿠폰 발급 — 락 획득 실패/재고 소진 시 409' })
  @Post(':id/issue')
  issue(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ): Promise<IssuedCoupon> {
    return this.issueCoupon.execute(id, body.userId);
  }

  @ApiOperation({ summary: '발급 건수 조회 (동시성 테스트 검증용)' })
  @Get(':id/issued-count')
  issuedCount(@Param('id') id: string): Promise<{ count: number }> {
    return this.getIssuedCount.execute(id);
  }
}
