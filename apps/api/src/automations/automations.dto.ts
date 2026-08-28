import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFlowFolderDto {
  @ApiProperty({ example: 'Ventas' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class CreateFlowDto {
  @ApiProperty({ example: 'Funnel de ventas automatizado' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Instancias de WhatsApp (bots) sobre las que corre el flujo — al menos una' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  instanceIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiProperty({ example: ['restaurante', 'brainpos'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  triggerKeywords!: string[];
}

export class UpdateFlowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  // Enviado como null para dejar el flujo sin carpeta.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  folderId?: string | null;

  @ApiPropertyOptional({ example: ['restaurante', 'brainpos'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  triggerKeywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Reemplaza los bots asociados al flujo — "Compartir" en el panel' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  instanceIds?: string[];

  @ApiPropertyOptional({ description: 'Diagrama completo (nodos + conexiones), tal como lo serializa el editor' })
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown>;
}

export class SimulateFlowDto {
  @ApiProperty({ example: 'restaurante' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
