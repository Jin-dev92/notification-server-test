import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationType } from '../../constants/notification.constants';

export class CreateNotificationDto {
  @ApiPropertyOptional({
    description: '특정 수신자 userId (broadcast와 함께 사용 불가)',
    example: 'user-123',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: '전체 브로드캐스트 여부',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  broadcast?: boolean;

  @ApiPropertyOptional({
    description: '알림 타입',
    enum: Object.values(NotificationType),
    default: NotificationType.INFO,
  })
  @IsIn(Object.values(NotificationType))
  @IsOptional()
  type?: NotificationType;

  @ApiProperty({
    description: '알림 제목',
    example: '주문 완료',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: '알림 본문',
    example: '결제가 완료되었어요',
  })
  @IsString()
  @IsOptional()
  body?: string;
}
