import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StartWidgetSessionDto {
  @ApiPropertyOptional({ description: 'Token de una VisitorSession previa, si el navegador ya tiene una guardada' })
  @IsOptional()
  @IsString()
  token?: string;
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
