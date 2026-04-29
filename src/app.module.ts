import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig, ENV_KEY, IS_PRODUCTION } from './common/constants/env';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        type: 'postgres',
        url: config.get(ENV_KEY.DATABASE_URL)!,
        entities: [__dirname + '/**/*.{entity,orm-entity}{.ts,.js}'],
        synchronize: !IS_PRODUCTION,
        logging: !IS_PRODUCTION,
      }),
    }),
    NotificationsModule,
  ],
})
export class AppModule {}
