import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthConfig, LoginResponse, RegisterResponse } from '@presspass/shared';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleAuthService } from './google.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto, ResendCodeDto, VerifyEmailDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';
import { REFRESH_COOKIE, RefreshTokenService } from './refresh-token.service';

/** Reads the opaque refresh token from the request's Cookie header. */
function readRefreshCookie(req: Request): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  private get secureCookie(): boolean {
    return (process.env.VERIFY_BASE_URL ?? 'https://id.domain.ua').startsWith('https://');
  }

  /** Issues a refresh token for the user and writes it as an HttpOnly cookie. */
  private async setRefreshCookie(res: Response, req: Request, userId: number): Promise<void> {
    const label = (req.headers['user-agent'] ?? '').toString().slice(0, 80);
    const issued = await this.refreshTokens.issueForUser(userId, label);
    res.cookie(
      REFRESH_COOKIE,
      issued.token,
      this.refreshTokens.cookieOptions(this.secureCookie, issued.expiresAt),
    );
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.refreshTokens.cookieOptions(this.secureCookie));
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Which optional sign-in methods are enabled' })
  getConfig(): AuthConfig {
    return { googleEnabled: this.googleAuthService.enabled };
  }

  @Public()
  // Stricter limit against brute force: 5 attempts per minute per IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Sign in with email and password, returns a JWT access token' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(dto.email, dto.password);
    await this.setRefreshCookie(res, req, result.user.id);
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the refresh cookie for a fresh access token (rotates it)' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const rotated = await this.refreshTokens.rotate(readRefreshCookie(req));
    if (!rotated) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const access = await this.authService.accessTokenForUser(rotated.userId);
    if (!access) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Account no longer exists');
    }
    res.cookie(
      REFRESH_COOKIE,
      rotated.issued.token,
      this.refreshTokens.cookieOptions(this.secureCookie, rotated.issued.expiresAt),
    );
    return { accessToken: access.accessToken };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post('register')
  @ApiOperation({ summary: 'Self-registration: sends a confirmation code to the email' })
  register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.registrationService.register(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Confirm the emailed code; activates the account and signs in' })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.registrationService.verifyEmail(dto.email, dto.code);
    await this.setRefreshCookie(res, req, result.user.id);
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-code')
  @ApiOperation({ summary: 'Send a fresh confirmation code' })
  resendCode(@Body() dto: ResendCodeDto): Promise<RegisterResponse> {
    return this.registrationService.resendCode(dto.email);
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start the "Sign in with Google" flow (browser redirect)' })
  async googleStart(@Res() res: Response): Promise<void> {
    res.redirect(await this.googleAuthService.buildAuthUrl());
  }

  @Public()
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    if (!code || !state) {
      res.redirect(`${this.siteBase()}/login?error=google`);
      return;
    }
    try {
      const { url, userId } = await this.googleAuthService.handleCallback(code, state);
      await this.setRefreshCookie(res, req, userId);
      res.redirect(url);
    } catch {
      res.redirect(`${this.siteBase()}/login?error=google`);
    }
  }

  private siteBase(): string {
    return (process.env.VERIFY_BASE_URL ?? 'https://id.domain.ua').replace(/\/+$/, '');
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({ summary: 'Sign out of this device (revokes this refresh token)' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.refreshTokens.revoke(readRefreshCookie(req));
    this.clearRefreshCookie(res);
    return this.authService.logout(user.sub);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  @ApiOperation({ summary: 'Sign out of every device (invalidates all tokens)' })
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.refreshTokens.revokeAll(user.sub);
    this.clearRefreshCookie(res);
    return this.authService.logoutAll(user.sub);
  }
}
