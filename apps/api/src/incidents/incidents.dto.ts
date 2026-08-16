import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackType, IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({ example: 'b6f1c2b0-2222-4444-8888-000000000000' })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({ example: 'b6f1c2b0-1111-4444-8888-000000000000' })
  @IsUUID()
  departmentId!: string;

  @ApiPropertyOptional({ enum: FeedbackType, default: FeedbackType.BUG })
  @IsOptional()
  @IsEnum(FeedbackType)
  type?: FeedbackType;

  @ApiProperty({ example: 'El comprobante no se genera' })
  @IsString()
  @MinLength(3)
  subject!: string;

  @ApiProperty({ example: 'El cliente indica que al facturar le sale error 500.' })
  @IsString()
  @MinLength(3)
  message!: string;
}

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;
}
