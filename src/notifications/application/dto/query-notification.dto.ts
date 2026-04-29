import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { NotificationStatus } from '../../constants/notification.constants';

export class QueryNotificationDto {
  @ApiProperty({ description: '조회할 userId', example: 'user-123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({
    description: '상태 필터',
    enum: Object.values(NotificationStatus),
  })
  @IsIn(Object.values(NotificationStatus))
  @IsOptional()
  status?: NotificationStatus;
}
