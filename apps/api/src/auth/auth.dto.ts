import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@braintech.com.pe' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe-123456!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'Si es true, el token dura más (sesión persistente en vez de la TTL corta por defecto).' })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'ChangeMe-123456!' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NuevaClave-987654!' })
  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Ana Torres' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class GoogleExchangeDto {
  @ApiProperty({ description: 'Ticket de un solo uso emitido por GET /auth/google/callback' })
  @IsString()
  ticket!: string;

  @ApiPropertyOptional({ description: 'Requerido solo cuando el ticket es de un correo de Google sin cuenta todavía (respuesta needsCompany: true).' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Brain Tech Perú' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName!: string;

  @ApiProperty({ example: 'Ana Torres' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'ana@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe-123456!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
