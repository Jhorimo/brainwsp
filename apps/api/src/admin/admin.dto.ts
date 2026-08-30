import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class UpdateCompanyAdminDto {
  @ApiPropertyOptional({ description: 'Activa o suspende el acceso de todos los usuarios de la empresa.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'null quita el plan asignado.' })
  @IsOptional()
  @IsUUID()
  planId?: string | null;

  @ApiPropertyOptional({ description: 'Fecha en la que vence la licencia actual. null = sin vencimiento.' })
  @IsOptional()
  @IsDateString()
  licenseRenewsAt?: string | null;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'Anual' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ enum: ['FREE', 'MONTHLY', 'ANNUAL'], example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  billingCycle?: string;

  @ApiPropertyOptional({ example: 9900, description: 'Precio en céntimos de sol (PEN).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 2700, description: 'Precio en centavos de dólar (USD).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAgents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInstances?: number;

  @ApiPropertyOptional({ description: 'Cuota mensual de mensajes (entrantes + salientes). Vacío = sin límite.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMessages?: number;

  @ApiPropertyOptional({ description: 'Se asigna automáticamente al registrar una empresa nueva. Solo un plan puede tenerlo activo.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Días de licencia otorgados la primera vez que se asigna este plan (registro).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Lista de beneficios que se muestran en la tarjeta del plan en "Mi Plan".', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: ['FREE', 'MONTHLY', 'ANNUAL'] })
  @IsOptional()
  @IsString()
  billingCycle?: string;

  @ApiPropertyOptional({ description: 'Precio en céntimos de sol (PEN).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Precio en centavos de dólar (USD).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAgents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInstances?: number;

  @ApiPropertyOptional({ description: 'Cuota mensual de mensajes (entrantes + salientes). Vacío = sin límite.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMessages?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Se asigna automáticamente al registrar una empresa nueva. Solo un plan puede tenerlo activo.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Días de licencia otorgados la primera vez que se asigna este plan (registro).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Lista de beneficios que se muestran en la tarjeta del plan en "Mi Plan".', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Yape' })
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiProperty({ example: '999 888 777' })
  @IsString()
  @MinLength(1)
  accountNumber!: string;

  @ApiProperty({ example: 'Irvin Castro' })
  @IsString()
  @MinLength(1)
  accountHolder!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qrImageUrl?: string;
}

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  accountHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({ description: 'null quita la imagen del QR.' })
  @IsOptional()
  @IsString()
  qrImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class RejectPaymentRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
