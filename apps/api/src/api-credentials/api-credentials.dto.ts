import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateApiCredentialDto {
  @ApiProperty({ example: 'BrainPOS Producción' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ description: 'Fija la credencial a una instancia específica de WhatsApp' })
  @IsOptional()
  @IsUUID()
  instanceId?: string;
}
