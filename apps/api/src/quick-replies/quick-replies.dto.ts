import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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

  @ApiProperty({ example: 'Hola, gracias por escribirnos. ¿En qué podemos ayudarte?' })
  @IsString()
  @MinLength(1)
  content!: string;
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
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
