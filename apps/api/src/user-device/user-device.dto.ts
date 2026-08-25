import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

// Los nombres de campo (snake_case, `wa_device_*`) replican exactamente el payload que
// envía brainpos_rest/models/ajuste_model.php::whatsapp_device_create — ese código PHP no
// se puede modificar.
export class CreateDeviceDto {
  @ApiProperty({ example: 'Restaurante Principal' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '51912941699' })
  @IsString()
  @MinLength(6)
  phone!: string;

  @ApiPropertyOptional({ description: 'URL de callback del sistema BrainPOS que crea el dispositivo (no se usa todavía).' })
  @IsOptional()
  @IsString()
  webhook_url?: string;
}

export class CreateAppDto {
  @ApiPropertyOptional({ description: 'UUID del dispositivo (instancia) devuelto por /api/user/device.' })
  @IsOptional()
  @IsString()
  device?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhook_url?: string;
}
