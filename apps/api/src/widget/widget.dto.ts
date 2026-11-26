import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StartWidgetSessionDto {
  @ApiPropertyOptional({ description: 'Token de una VisitorSession previa, si el navegador ya tiene una guardada' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Origen (dominio + ruta) de la página donde está embebido el widget, reportado por widget.js — para que soporte sepa de qué cliente se trata' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'Origen del enlace público (/c/<empresa>/<origen>), ej. instagram o tiktok. Solo aplica al enlace, no al widget embebido' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  src?: string;
}

export class SendWidgetMessageDto {
  @ApiProperty({ description: 'Token de VisitorSession devuelto por /widget/:key/session' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'Hola, estoy interesado en su sistema para restaurantes' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class StartCallDto {
  @ApiProperty({ description: 'Token de VisitorSession devuelto por /widget/:key/session' })
  @IsString()
  token!: string;
}

export class EditWidgetMessageDto {
  @ApiProperty({ description: 'Token de VisitorSession devuelto por /widget/:key/session' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'Hola, perdón, quise decir otra cosa' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class SaveWidgetProfileDto {
  @ApiProperty({ description: 'Token de VisitorSession devuelto por /widget/:key/session' })
  @IsString()
  token!: string;

  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'maria@gmail.com' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '51987654321', description: 'Celular con código de país, sin +' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
  @ApiPropertyOptional({ description: 'Casilla «Avisarme por correo cuando me respondan». true por defecto' })
  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;

  @ApiPropertyOptional({ description: '«Continuar sin ver el historial»: une la visita al chat existente de ese correo, sin código; solo ve los mensajes desde ahora' })
  @IsOptional()
  @IsBoolean()
  withoutHistory?: boolean;

  @ApiPropertyOptional({ deprecated: true, description: 'Nombre anterior de withoutHistory (páginas abiertas antes del cambio)' })
  @IsOptional()
  @IsBoolean()
  newChat?: boolean;
}

export class VerifyEmailCodeDto {
  @ApiProperty({ description: 'Token de VisitorSession' })
  @IsString()
  token!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MaxLength(20)
  code!: string;
}

// Enlace de los correos de aviso: "Continuar la conversación" (?r=) y "No quiero recibir
// más avisos" (?baja=). Ver resume-token.ts.
export class ResumeTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  r!: string;
}
