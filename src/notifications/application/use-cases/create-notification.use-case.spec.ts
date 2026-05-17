import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_PUBLISHER } from '../../../redis/redis.constants';
import {
  NotificationStatus,
  NotificationType,
  REDIS_CHANNEL,
} from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { CreateNotificationUseCase } from './create-notification.use-case';

const USER_ID = 'user-123';
const NOTIFICATION_ID = 1;

function createMockNotification(
  overrides?: Partial<Notification>,
): Notification {
  const n = new Notification();
  n.id = NOTIFICATION_ID;
  n.userId = USER_ID;
  n.type = NotificationType.INFO;
  n.title = '테스트 알림';
  n.body = '본문';
  n.status = NotificationStatus.PENDING;
  n.createdAt = new Date('2026-04-29T00:00:00.000Z');
  n.updatedAt = new Date('2026-04-29T00:00:00.000Z');
  n.readAt = null;
  Object.assign(n, overrides);
  return n;
}

describe('CreateNotificationUseCase', () => {
  let useCase: CreateNotificationUseCase;
  let notificationRepository: jest.Mocked<NotificationRepository>;
  let publisher: { publish: jest.Mock };

  beforeEach(async () => {
    notificationRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findMissed: jest.fn(),
      updateStatus: jest.fn(),
      updateManyStatus: jest.fn(),
    };

    publisher = { publish: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateNotificationUseCase,
        { provide: NotificationRepository, useValue: notificationRepository },
        { provide: REDIS_PUBLISHER, useValue: publisher },
      ],
    }).compile();

    useCase = module.get(CreateNotificationUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('userId가 없고 broadcast도 false이면 BadRequestException을 던진다', async () => {
      const dto: CreateNotificationDto = { title: '알림' };

      await expect(useCase.execute(dto)).rejects.toThrow(BadRequestException);
    });

    it('특정 userId로 알림을 생성하고 user 채널에 publish한다', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        title: '주문 완료',
        body: '결제 완료',
      };
      const mockNotification = createMockNotification();
      notificationRepository.create.mockResolvedValue(mockNotification);

      const result = await useCase.execute(dto);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notificationRepository.create).toHaveBeenCalledTimes(1);
      expect(publisher.publish).toHaveBeenCalledWith(
        REDIS_CHANNEL.user(USER_ID),
        expect.stringContaining('"title":"테스트 알림"'),
      );
      expect(result).toEqual(mockNotification);
    });

    it('broadcast가 true이면 broadcast 채널에 publish한다', async () => {
      const dto: CreateNotificationDto = { broadcast: true, title: '공지' };
      const mockNotification = createMockNotification({ userId: 'broadcast' });
      notificationRepository.create.mockResolvedValue(mockNotification);

      await useCase.execute(dto);

      expect(publisher.publish).toHaveBeenCalledWith(
        REDIS_CHANNEL.BROADCAST,
        expect.any(String),
      );
    });
  });
});
