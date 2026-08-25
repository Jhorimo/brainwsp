import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateLeadDto {
  @ApiProperty({ example: 'Fuentes — Flete marítimo LCL' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() personName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) score?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) value?: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conversationId?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) score?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) value?: number;

  @ApiPropertyOptional({ description: 'UUID de usuario, o null para quitar la asignación' })
  @IsOptional()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ description: 'UUID de departamento, o null para quitarlo' })
  @IsOptional()
  departmentId?: string | null;
}

export class CreateDealDto {
  @ApiProperty({ example: 'López — Flete marítimo LCL' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty() @IsUUID() departmentId!: string;
  @ApiProperty() @IsUUID() stageId!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) probability?: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() expectedCloseAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conversationId?: string;
}

export class UpdateDealDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() stageId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) probability?: number;
  @ApiPropertyOptional({ description: 'ISO 8601, o null para quitar la fecha' }) @IsOptional() expectedCloseAt?: string | null;
  @ApiPropertyOptional({ description: 'UUID de usuario, o null para quitar la asignación' }) @IsOptional() assignedUserId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personPhone?: string;

  @ApiPropertyOptional({ type: [String], description: 'Reemplaza por completo las etiquetas del trato' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];
}
