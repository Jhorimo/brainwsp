import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackStatus, FeedbackType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @ApiPropertyOptional({ enum: FeedbackType, default: FeedbackType.SUGGESTION })
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @ApiProperty({ example: 'Poder duplicar una plantilla' })
  @IsString()
  @MinLength(3)
  subject!: string;

  @ApiProperty({ example: 'Sería útil poder duplicar una respuesta rápida existente en vez de escribirla de cero.' })
  @IsString()
  @MinLength(3)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus })
  @IsEnum(FeedbackStatus)
  status!: FeedbackStatus;
}
