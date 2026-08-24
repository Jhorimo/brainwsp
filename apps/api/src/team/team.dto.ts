import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '../common/constants/modules';

export class CreateTeamUserDto {
  @ApiProperty({ example: 'Carlos Soporte' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'carlos@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Cambiar-123456!' })
  @IsString()
  @MinLength(10)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.AGENT })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ type: [String], description: 'Departamentos a los que queda asignado el usuario.' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String], enum: MODULE_KEYS, description: 'Módulos del menú visibles para este usuario (solo aplica al rol Agente). Vacío o ausente = sin restricción.' })
  @IsOptional()
  @IsArray()
  @IsIn(MODULE_KEYS, { each: true })
  allowedModules?: ModuleKey[];
}

export class UpdateTeamUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Si se envía, reemplaza la contraseña actual.' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;

  @ApiPropertyOptional({ type: [String], description: 'Reemplaza por completo los departamentos asignados al usuario.' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String], enum: MODULE_KEYS, description: 'Reemplaza por completo los módulos visibles (solo aplica al rol Agente). Vacío = sin restricción.' })
  @IsOptional()
  @IsArray()
  @IsIn(MODULE_KEYS, { each: true })
  allowedModules?: ModuleKey[];
}

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Soporte' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Atención técnica de BrainPOS y ERP' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SetDepartmentMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}

export class CreateProjectDto {
  @ApiProperty({ example: 'BrainPOS' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Sistema de punto de venta' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateStageDto {
  @ApiProperty({ example: 'Calificado' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '#6b8afd' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateTagDto {
  @ApiProperty({ example: 'Cliente VIP' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '#6b8afd' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional({ example: 'Cliente VIP' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '#6b8afd' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ description: 'Instrucciones del sistema para el agente IA. Vacío = usa el prompt por defecto.' })
  @IsOptional()
  @IsString()
  aiSystemPrompt?: string;
}

export class CreateKnowledgeEntryDto {
  @ApiProperty({ example: 'Horario de atención' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({ example: 'Atendemos de lunes a sábado de 9am a 7pm.' })
  @IsString()
  @MinLength(2)
  content!: string;
}

export class UpdateKnowledgeEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  content?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
