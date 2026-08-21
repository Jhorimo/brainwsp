import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@braintech.com.pe' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe-123456!' })
  @IsString()
  @MinLength(8)
  password!: string;
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
