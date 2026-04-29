import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_SUBSCRIBER } from '../../../redis/redis.constants';
import { SseManagerService } from '../../../sse/sse-manager.service';
import { REDIS_CHANNEL } from '../../constants/notification.constants';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { NotificationEventService } from './notification-event.service';

const USER_ID = 'user-123';

describe('NotificationEventService', () => {
  let service: NotificationEventService;
  let subscriber: {
    on: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let sseManager: jest.Mocked<SseManagerService>;
  let notificationRepository: jest.Mocked<NotificationRepository>;

  beforeEach(async () => {
    subscriber = {
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    };

    sseManager = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      emit: jest.fn(),
      emitToAll: jest.fn(),
      hasConnection: jest.fn(),
    } as unknown as jest.Mocked<SseManagerService>;

    notificationRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findMissed: jest.fn(),
      updateStatus: jest.fn(),
      updateManyStatus: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventService,
        { provide: REDIS_SUBSCRIBER, useValue: subscriber },
        { provide: SseManagerService, useValue: sseManager },
        { provide: NotificationRepository, useValue: notificationRepository },
      ],
    }).compile();

    service = module.get(NotificationEventService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('broadcast 채널을 구독한다', () => {
      expect(subscriber.subscribe).toHaveBeenCalledWith(
        REDIS_CHANNEL.BROADCAST,
      );
    });

    it('message 이벤트 핸들러를 등록한다', () => {
      expect(subscriber.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  describe('subscribeUserChannel / unsubscribeUserChannel', () => {
    it('첫 번째 연결 시 Redis user 채널을 구독한다', async () => {
      await service.subscribeUserChannel(USER_ID);

      expect(subscriber.subscribe).toHaveBeenCalledWith(
        REDIS_CHANNEL.user(USER_ID),
      );
    });

    it('두 번째 연결 시 중복 구독하지 않는다', async () => {
      await service.subscribeUserChannel(USER_ID);
      await service.subscribeUserChannel(USER_ID);

      expect(subscriber.subscribe).toHaveBeenCalledTimes(
        2, // onModuleInit의 broadcast 구독 1회 + user 채널 1회
      );
    });

    it('마지막 연결이 끊기면 user 채널 구독을 해제한다', async () => {
      await service.subscribeUserChannel(USER_ID);
      await service.unsubscribeUserChannel(USER_ID);

      expect(subscriber.unsubscribe).toHaveBeenCalledWith(
        REDIS_CHANNEL.user(USER_ID),
      );
    });

    it('연결이 2개일 때 1개만 끊으면 채널 구독을 유지한다', async () => {
      await service.subscribeUserChannel(USER_ID);
      await service.subscribeUserChannel(USER_ID);
      await service.unsubscribeUserChannel(USER_ID);

      expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    });
  });
});
