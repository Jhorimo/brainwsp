import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateApiCredentialDto {
  @ApiProperty({ example: 'BrainPOS Producción' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiProperty({ description: 'Instancia de WhatsApp a la que pertenece esta credencial (cada instancia solo puede tener una)' })
  @IsUUID()
  instanceId!: string;
}

export class UpdateApiCredentialDto {
  @ApiPropertyOptional({ example: 'Integración Producción' })
  @IsString()
  @MinLength(3)
  name!: string;
}
