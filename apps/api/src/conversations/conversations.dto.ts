import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendAgentMessageDto {
  @ApiProperty({ example: 'Hola, le envío su comprobante.' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: 'Id del mensaje al que se responde ("Responder"), debe pertenecer a la misma conversación.' })
  @IsOptional()
  @IsUUID()
  quotedMessageId?: string;
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

  @ApiPropertyOptional({ description: 'Nombre del contacto, si ya lo conoces (queda como el nombre del cliente en el panel).', example: 'Alexander' })
  @IsOptional()
  @IsString()
  name?: string;
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

export class UpdateContactNameDto {
  @ApiProperty({ example: 'Jhon Ramirez' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
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

export class SendContactDto {
  @ApiProperty({ description: 'Id de un contacto de esta empresa a compartir como tarjeta de WhatsApp.' })
  @IsUUID()
  contactId!: string;
}

export class SendReactionDto {
  // Empty string removes the agent's own reaction from this message.
  @ApiProperty({ example: '👍' })
  @IsString()
  emoji!: string;
}

export class UpdateStageDto {
  @ApiPropertyOptional({ description: 'null quita la etapa (ej. si la conversación no tiene departamento asignado).' })
  @IsOptional()
  @IsUUID()
  stageId?: string | null;
}
