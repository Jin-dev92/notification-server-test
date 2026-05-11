import { Injectable } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class CacheMetricsSseService {
  private readonly subject = new Subject<MessageEvent>();

  broadcast(data: MessageEvent): void {
    this.subject.next(data);
  }

  stream(): Observable<MessageEvent> {
    return this.subject.asObservable();
  }
}
