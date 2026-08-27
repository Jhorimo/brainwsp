import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WhatsAppProvider } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
