import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationStatus,
  NotificationType,
} from '../../constants/notification.constants';
import { Notification } from '../../domain/entities/notification';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { MarkAsReadUseCase } from './mark-as-read.use-case';

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

describe('MarkAsReadUseCase', () => {
  let useCase: MarkAsReadUseCase;
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
        MarkAsReadUseCase,
        { provide: NotificationRepository, useValue: notificationRepository },
      ],
    }).compile();

    useCase = module.get(MarkAsReadUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('알림을 READ 상태로 업데이트하고 반환한다', async () => {
      const notification = createMockNotification();
      notificationRepository.findById.mockResolvedValue(notification);
      notificationRepository.update.mockImplementation((n) =>
        Promise.resolve(n),
      );

      const result = await useCase.execute(NOTIFICATION_ID);

      expect(result.status).toBe(NotificationStatus.READ);
      expect(result.readAt).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notificationRepository.update).toHaveBeenCalledTimes(1);
    });

    it('존재하지 않는 id이면 NotFoundException을 던진다', async () => {
      notificationRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(999)).rejects.toThrow(NotFoundException);
    });
  });
});
