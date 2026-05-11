import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CacheMetricsSseService } from '../application/services/cache-metrics-sse.service';
import { WriteBehindFlusherService } from '../application/services/write-behind-flusher.service';
import { GetProductByIdUseCase } from '../application/use-cases/get-product-by-id.use-case';
import { GetProductsCacheAsideUseCase } from '../application/use-cases/get-products-cache-aside.use-case';
import { GetProductsUseCase } from '../application/use-cases/get-products.use-case';
import { SeedProductsUseCase } from '../application/use-cases/seed-products.use-case';
import { UpdateProductWriteBehindUseCase } from '../application/use-cases/update-product-write-behind.use-case';
import { UpdateProductWriteThroughUseCase } from '../application/use-cases/update-product-write-through.use-case';
import { UpdateProductData } from '../domain/repositories/product.repository';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly getProducts: GetProductsUseCase,
    private readonly getProductsCacheAside: GetProductsCacheAsideUseCase,
    private readonly getProductById: GetProductByIdUseCase,
    private readonly updateWriteThrough: UpdateProductWriteThroughUseCase,
    private readonly updateWriteBehind: UpdateProductWriteBehindUseCase,
    private readonly seedProducts: SeedProductsUseCase,
    private readonly metricsSse: CacheMetricsSseService,
    private readonly flusher: WriteBehindFlusherService,
  ) {}

  @ApiOperation({ summary: '상품 목록 조회 (전략별)' })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: ['cache-aside', 'write-through', 'write-behind'],
  })
  @Get()
  getAll(@Query('strategy') strategy = 'cache-aside') {
    if (strategy === 'cache-aside') {
      return this.getProductsCacheAside.execute();
    }
    return this.getProducts.execute();
  }

  @ApiOperation({ summary: '개별 상품 조회 (product:{id} 캐시 키)' })
  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.getProductById.execute(id);
  }

  @ApiOperation({ summary: '상품 수정 (전략별)' })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: ['write-through', 'write-behind'],
  })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductData,
    @Query('strategy') strategy = 'write-through',
  ) {
    if (strategy === 'write-behind') {
      return this.updateWriteBehind.execute(id, dto);
    }
    return this.updateWriteThrough.execute(id, dto);
  }

  @ApiOperation({ summary: '상품 시드 데이터 생성' })
  @Post('seed')
  seed(@Body('count') count: number) {
    return this.seedProducts.execute(count);
  }

  @ApiOperation({ summary: '캐시 메트릭 SSE 스트림' })
  @Sse('metrics/stream')
  metricsStream(): Observable<MessageEvent> {
    return this.metricsSse.stream();
  }

  @ApiOperation({ summary: 'Write-Behind 워커 일시중지 (데모 전용)' })
  @Post('write-behind/pause')
  pause() {
    this.flusher.pause();
    return { paused: true };
  }

  @ApiOperation({ summary: 'Write-Behind 워커 재개 (데모 전용)' })
  @Post('write-behind/resume')
  resume() {
    this.flusher.resume();
    return { paused: false };
  }
}
