import { Notification } from '../../domain/entities/notification';
import { NotificationEntity } from './notification.entity';

export class NotificationMapper {
  static toDomain(orm: NotificationEntity): Notification {
    const entity = new Notification();
    entity.id = orm.id;
    entity.userId = orm.userId;
    entity.type = orm.type;
    entity.title = orm.title;
    entity.body = orm.body;
    entity.status = orm.status;
    entity.createdAt = orm.createdAt;
    entity.updatedAt = orm.updatedAt;
    entity.readAt = orm.readAt;
    return entity;
  }

  static toOrm(domain: Notification): NotificationEntity {
    const orm = new NotificationEntity();
    if (domain.id) orm.id = domain.id;
    orm.userId = domain.userId;
    orm.type = domain.type;
    orm.title = domain.title;
    orm.body = domain.body;
    orm.status = domain.status;
    orm.readAt = domain.readAt;
    return orm;
  }
}
