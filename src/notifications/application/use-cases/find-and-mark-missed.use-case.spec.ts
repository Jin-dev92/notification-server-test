import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationStatus,
  NotificationType,
} from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { FindAndMarkMissedUseCase } from './find-and-mark-missed.use-case';

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

describe('FindAndMarkMissedUseCase', () => {
  let useCase: FindAndMarkMissedUseCase;
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
    } as unknown as jest.Mocked<NotificationRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindAndMarkMissedUseCase,
        { provide: NotificationRepository, useValue: notificationRepository },
      ],
    }).compile();

    useCase = module.get(FindAndMarkMissedUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('lastEventId 이후의 pending 알림을 조회하고 delivered로 업데이트한다', async () => {
      const missed = [
        createMockNotification({ id: 5 }),
        createMockNotification({ id: 6 }),
      ];
      notificationRepository.findMissed.mockResolvedValue(missed);
      notificationRepository.updateManyStatus.mockResolvedValue(undefined);

      const result = await useCase.execute(USER_ID, 4);

      expect(result).toHaveLength(2);
      expect(notificationRepository.updateManyStatus).toHaveBeenCalledWith(
        [5, 6],
        NotificationStatus.DELIVERED,
      );
    });

    it('미전달 알림이 없으면 updateManyStatus를 호출하지 않는다', async () => {
      notificationRepository.findMissed.mockResolvedValue([]);

      const result = await useCase.execute(USER_ID, 10);

      expect(result).toHaveLength(0);
      expect(notificationRepository.updateManyStatus).not.toHaveBeenCalled();
    });
  });
});
