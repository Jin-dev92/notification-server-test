import { Injectable } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { CacheEvent } from '../../constants/product-cache.constants';
import { CacheMetricsSseService } from './cache-metrics-sse.service';

@Injectable()
export class CacheMetricsService {
  constructor(private readonly sse: CacheMetricsSseService) {}

  emit(event: CacheEvent, payload: Record<string, unknown> = {}): void {
    const data: MessageEvent = {
      data: { event, ...payload, ts: Date.now() },
      type: 'cache_metric',
    };
    this.sse.broadcast(data);
  }
}
