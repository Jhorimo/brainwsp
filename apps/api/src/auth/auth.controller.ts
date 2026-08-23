import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, dto.remember, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser) {
    return this.auth.getProfile(user);
  }

  @Patch('password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }
}
