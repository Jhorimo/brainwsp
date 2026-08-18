import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ example: 9900, description: 'Precio en céntimos de la moneda local.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
