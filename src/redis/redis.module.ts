import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig, ENV_KEY } from '../common/constants/env';
import { RedlockLockService } from './lock/redlock-lock.service';
import { SetnxLockService } from './lock/setnx-lock.service';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './redis.constants';

@Module({
  providers: [
    {
      provide: REDIS_PUBLISHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new Redis(config.get(ENV_KEY.REDIS_URL)!),
    },
    SetnxLockService,
    RedlockLockService,
  ],
  exports: [REDIS_PUBLISHER, REDIS_SUBSCRIBER, SetnxLockService, RedlockLockService],
})
export class RedisModule {}
