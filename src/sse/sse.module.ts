import { Module } from '@nestjs/common';
import { SseManagerService } from './sse-manager.service';

@Module({
  providers: [SseManagerService],
  exports: [SseManagerService],
})
export class SseModule {}
