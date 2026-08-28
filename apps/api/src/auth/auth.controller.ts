import { Body, Controller, Get, Logger, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getPrimaryWebOrigin } from '../common/cors-origin';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { AuthService } from './auth.service';
import { ChangePasswordDto, GoogleExchangeDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private static readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, dto.remember, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Get('google')
  googleStart(@Res() res: Response) {
    res.redirect(this.auth.buildGoogleAuthUrl());
  }

  // Public: Google redirects the browser here with no Authorization header. Hands the
  // browser a short-lived ticket via query param (never the real session token) — the
  // frontend immediately exchanges it server-side in exchangeGoogle() below.
  @Get('google/callback')
  async googleCallback(@Query('code') code: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    // WEB_ORIGIN puede traer varios orígenes separados por coma, incluyendo comodines de
    // subdominio (ver cors-origin.ts). El redirect de OAuth solo puede ir a un dominio
    // concreto, así que se usa siempre el primer origen exacto como frontend "canónico".
    const webOrigin = getPrimaryWebOrigin();
    if (error || !code) {
      res.redirect(`${webOrigin}/login?google_error=1`);
      return;
    }
    try {
      const ticket = await this.auth.handleGoogleCallback(code);
      res.redirect(`${webOrigin}/login?g=${encodeURIComponent(ticket)}`);
    } catch (cause) {
      // Igual que en CalendarController: sin este log, "no se pudo conectar con
      // Google" no dejaba ninguna pista en el servidor.
      AuthController.logger.error(`Fallo el login con Google: ${cause instanceof Error ? cause.message : String(cause)}`, cause instanceof Error ? cause.stack : undefined);
      res.redirect(`${webOrigin}/login?google_error=1`);
    }
  }

  @Post('google/exchange')
  exchangeGoogle(@Body() dto: GoogleExchangeDto, @Req() req: Request) {
    return this.auth.exchangeGoogleTicket(dto.ticket, dto.companyName, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser) {
    return this.auth.getProfile(user);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.sub, dto.name);
  }

  @Patch('password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }
}
