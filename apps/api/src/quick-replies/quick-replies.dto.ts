import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';

// Máximo de archivos por respuesta rápida, contando el principal (igual que MAX_PENDING_FILES del chat).
export const MAX_QUICK_REPLY_FILES = 10;

export class QuickReplyAttachmentDto {
  @IsString()
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}

const SHORTCUT_PATTERN = /^[a-z0-9_-]+$/;
const SHORTCUT_MESSAGE = 'El atajo solo puede tener letras minúsculas, números, guiones y guiones bajos';

export class CreateQuickReplyDto {
  @ApiProperty({ example: 'saludo' })
  @IsString()
  @MinLength(1)
  @Matches(SHORTCUT_PATTERN, { message: SHORTCUT_MESSAGE })
  shortcut!: string;

  @ApiProperty({ example: 'Saludo inicial' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: 'Hola, gracias por escribirnos. ¿En qué podemos ayudarte?' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fileSize?: number;

  // Adjuntos además del principal (mediaUrl). En update, [] o null los quita todos.
  @ApiPropertyOptional({ type: () => [QuickReplyAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUICK_REPLY_FILES - 1)
  @ValidateNested({ each: true })
  @Type(() => QuickReplyAttachmentDto)
  extraAttachments?: QuickReplyAttachmentDto[];

  // Departamento que puede verla; sin valor (o null en update) = todos.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string | null;
}

export class UpdateQuickReplyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(SHORTCUT_PATTERN, { message: SHORTCUT_MESSAGE })
  shortcut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // Sent as null to clear an existing attachment.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  fileSize?: number | null;

  // Adjuntos además del principal (mediaUrl). En update, [] o null los quita todos.
  @ApiPropertyOptional({ type: () => [QuickReplyAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUICK_REPLY_FILES - 1)
  @ValidateNested({ each: true })
  @Type(() => QuickReplyAttachmentDto)
  extraAttachments?: QuickReplyAttachmentDto[] | null;

  // Departamento que puede verla; sin valor (o null en update) = todos.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string | null;
}
