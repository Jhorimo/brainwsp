import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
}
