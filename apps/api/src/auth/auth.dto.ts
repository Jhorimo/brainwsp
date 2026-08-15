import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@braintech.com.pe' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe-123456!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
