import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig, ENV_KEY } from './common/constants/env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Notification Server API')
    .setVersion('1.0')
    .setDescription('Redis Pub/Sub + SSE 기반 실시간 알림 서버')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const configService = app.get<ConfigService<AppConfig>>(ConfigService);
  const clientUrl =
    configService.get<string>(ENV_KEY.CLIENT_URL) ?? 'http://localhost:5173';
  app.enableCors({ origin: clientUrl });
  const port = configService.get<string>(ENV_KEY.PORT) ?? '3000';
  await app.listen(port);
}
void bootstrap();
