import { Injectable } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SSE_EVENT_TYPE } from './sse.constants';

export interface NotificationPayload {
  id: number;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
}

@Injectable()
export class SseManagerService {
  private readonly streams = new Map<string, Set<Subject<MessageEvent>>>();

  subscribe(userId: string): {
    observable: Observable<MessageEvent>;
    subject: Subject<MessageEvent>;
  } {
    const subject = new Subject<MessageEvent>();

    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Set());
    }
    this.streams.get(userId)!.add(subject);

    return { observable: subject.asObservable(), subject };
  }

  unsubscribe(userId: string, subject: Subject<MessageEvent>): void {
    subject.complete();
    const subjects = this.streams.get(userId);
    if (subjects) {
      subjects.delete(subject);
      if (subjects.size === 0) {
        this.streams.delete(userId);
      }
    }
  }

  emit(userId: string, payload: NotificationPayload): void {
    this.streams.get(userId)?.forEach((subject) =>
      subject.next({
        data: payload,
        id: String(payload.id),
        type: SSE_EVENT_TYPE.NOTIFICATION,
      }),
    );
  }

  emitToAll(payload: NotificationPayload): void {
    this.streams.forEach((subjects) =>
      subjects.forEach((subject) =>
        subject.next({
          data: payload,
          id: String(payload.id),
          type: SSE_EVENT_TYPE.NOTIFICATION,
        }),
      ),
    );
  }

  hasConnection(userId: string): boolean {
    const subjects = this.streams.get(userId);
    return !!subjects && subjects.size > 0;
  }
}
