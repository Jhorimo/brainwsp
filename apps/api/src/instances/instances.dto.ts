import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WhatsAppProvider } from '@prisma/client';
import { IsBoolean, IsEnum, IsHexColor, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateInstanceDto {
  @ApiProperty({ example: 'WhatsApp Ventas' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiProperty({ example: 'ventas' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @ApiPropertyOptional({ enum: WhatsAppProvider, default: WhatsAppProvider.BAILEYS })
  @IsOptional()
  @IsEnum(WhatsAppProvider)
  provider?: WhatsAppProvider;
}

export class UpdateInstanceDto {
  @ApiPropertyOptional({ example: 'WhatsApp Ventas' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional({ example: 'ventas' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;
}

// Branding básico del widget (Fase 1) — deliberadamente corto, ver punto 10 del brief
// ("no sobrecargar esta parte inicialmente"). Todo opcional: PATCH parcial, se fusiona con
// lo que ya hubiera (ver InstancesService.updateWidgetConfig).
export class UpdateWidgetConfigDto {
  @ApiPropertyOptional({ example: 'Brain Tech' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Hola 👋 ¿En qué podemos ayudarte?' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  welcomeMessage?: string;

  @ApiPropertyOptional({ example: '#6b8afd' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ enum: ['left', 'right'] })
  @IsOptional()
  @IsIn(['left', 'right'])
  position?: 'left' | 'right';

  @ApiPropertyOptional({ example: '¿Necesitas ayuda?' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  buttonText?: string;

  @ApiPropertyOptional({ description: 'Si el panel se abre solo al entrar a la página, en vez de quedar cerrado hasta que el visitante haga clic en el botón' })
  @IsOptional()
  @IsBoolean()
  autoOpen?: boolean;
}
