import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationStatus,
  NotificationType,
} from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { GetNotificationsUseCase } from './get-notifications.use-case';

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

describe('GetNotificationsUseCase', () => {
  let useCase: GetNotificationsUseCase;
  let notificationRepository: jest.Mocked<NotificationRepository>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetNotificationsUseCase,
        { provide: NotificationRepository, useValue: notificationRepository },
      ],
    }).compile();

    useCase = module.get(GetNotificationsUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('userId 기준으로 알림 목록을 반환한다', async () => {
      const mockList = [createMockNotification()];
      notificationRepository.findAll.mockResolvedValue(mockList);

      const result = await useCase.execute({ userId: USER_ID });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notificationRepository.findAll).toHaveBeenCalledWith({
        userId: USER_ID,
        status: undefined,
      });
      expect(result).toHaveLength(1);
    });

    it('status 필터가 있으면 repository에 전달한다', async () => {
      notificationRepository.findAll.mockResolvedValue([]);

      await useCase.execute({
        userId: USER_ID,
        status: NotificationStatus.PENDING,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notificationRepository.findAll).toHaveBeenCalledWith({
        userId: USER_ID,
        status: NotificationStatus.PENDING,
      });
    });
  });
});
