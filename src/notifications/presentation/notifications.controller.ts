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
  Req,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  EMPTY,
  Observable,
  Subject,
  concat,
  from,
  interval,
  merge,
} from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { SseManagerService } from '../../sse/sse-manager.service';
import { SSE_EVENT_TYPE, SSE_PING_INTERVAL_MS } from '../../sse/sse.constants';
import { CreateNotificationDto } from '../application/dto/create-notification.dto';
import { QueryNotificationDto } from '../application/dto/query-notification.dto';
import { NotificationEventService } from '../application/services/notification-event.service';
import { CreateNotificationUseCase } from '../application/use-cases/create-notification.use-case';
import { FindAndMarkMissedUseCase } from '../application/use-cases/find-and-mark-missed.use-case';
import { GetNotificationsUseCase } from '../application/use-cases/get-notifications.use-case';
import { MarkAsReadUseCase } from '../application/use-cases/mark-as-read.use-case';
import { Notification } from '../domain/entities/notification';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly getNotificationsUseCase: GetNotificationsUseCase,
    private readonly markAsReadUseCase: MarkAsReadUseCase,
    private readonly findAndMarkMissedUseCase: FindAndMarkMissedUseCase,
    private readonly notificationEventService: NotificationEventService,
    private readonly sseManager: SseManagerService,
  ) {}

  @ApiOperation({ summary: 'SSE 연결 — 실시간 알림 스트림' })
  @ApiQuery({ name: 'userId', required: true, description: '수신자 userId' })
  @ApiResponse({ status: 200, description: 'SSE 스트림 연결 성공' })
  @Sse('stream')
  async stream(
    @Query('userId') userId: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    const { observable, subject } = this.sseManager.subscribe(userId);
    await this.notificationEventService.subscribeUserChannel(userId);

    req.on('close', () => {
      this.sseManager.unsubscribe(userId, subject as Subject<MessageEvent>);
      void this.notificationEventService.unsubscribeUserChannel(userId);
    });

    const ping$ = interval(SSE_PING_INTERVAL_MS).pipe(
      map(
        (): MessageEvent => ({
          data: { ts: Date.now() },
          type: SSE_EVENT_TYPE.PING,
        }),
      ),
    );

    const rawLastId = req.headers['last-event-id'];
    const lastEventId = rawLastId
      ? Number(Array.isArray(rawLastId) ? rawLastId[0] : rawLastId)
      : null;

    const reconnect$ =
      lastEventId !== null && !isNaN(lastEventId)
        ? from(this.findAndMarkMissedUseCase.execute(userId, lastEventId)).pipe(
            mergeMap((notifications) => from(notifications)),
            map(
              (n): MessageEvent => ({
                data: {
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  createdAt: n.createdAt.toISOString(),
                },
                id: String(n.id),
                type: SSE_EVENT_TYPE.NOTIFICATION,
              }),
            ),
          )
        : EMPTY;

    return concat(reconnect$, merge(observable, ping$));
  }

  @ApiOperation({ summary: '알림 발송' })
  @ApiResponse({ status: 201, type: Notification })
  @ApiResponse({ status: 400, description: 'userId 또는 broadcast 누락' })
  @Post()
  create(@Body() dto: CreateNotificationDto): Promise<Notification> {
    return this.createNotificationUseCase.execute(dto);
  }

  @ApiOperation({ summary: '알림 목록 조회' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'delivered', 'read'],
  })
  @ApiResponse({ status: 200, type: [Notification] })
  @Get()
  findAll(@Query() query: QueryNotificationDto): Promise<Notification[]> {
    return this.getNotificationsUseCase.execute(query);
  }

  @ApiOperation({ summary: '읽음 처리' })
  @ApiResponse({ status: 200, type: Notification })
  @ApiResponse({ status: 404, description: '알림 없음' })
  @Patch(':id/read')
  markAsRead(@Param('id', ParseIntPipe) id: number): Promise<Notification> {
    return this.markAsReadUseCase.execute(id);
  }
}
