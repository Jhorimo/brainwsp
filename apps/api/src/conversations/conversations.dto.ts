import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus, LeadStage } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendAgentMessageDto {
  @ApiProperty({ example: 'Hola, le envío su comprobante.' })
  @IsString()
  @MinLength(1)
  message!: string;
}

export class StartConversationDto {
  @ApiProperty()
  @IsUUID()
  instanceId!: string;

  @ApiProperty({ example: '51999999999' })
  @IsString()
  @MinLength(8)
  phone!: string;

  @ApiProperty({ example: 'Hola, le escribo de...' })
  @IsString()
  @MinLength(1)
  text!: string;
}

export class UpdateMessageFlagsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

export class ForwardMessageDto {
  @ApiProperty()
  @IsUUID()
  targetConversationId!: string;
}

export class UpdateNotesDto {
  @ApiProperty()
  @IsString()
  notes!: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: 'Activa/desactiva el agente IA para esta conversación.' })
  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;
}

export class AttachTagDto {
  @ApiProperty()
  @IsUUID()
  tagId!: string;
}

export class SendStickerDto {
  @ApiProperty()
  @IsUUID()
  stickerId!: string;
}

export class UpdateLeadStageDto {
  @ApiProperty({ enum: LeadStage })
  @IsEnum(LeadStage)
  leadStage!: LeadStage;
}
