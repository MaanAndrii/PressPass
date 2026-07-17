import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthConfig, LoginResponse, RegisterResponse } from '@presspass/shared';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleAuthService } from './google.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto, ResendCodeDto, VerifyEmailDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

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
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password);
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
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<LoginResponse> {
    return this.registrationService.verifyEmail(dto.email, dto.code);
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
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    if (!code || !state) {
      res.redirect(`${this.siteBase()}/login?error=google`);
      return;
    }
    try {
      res.redirect(await this.googleAuthService.handleCallback(code, state));
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
  @ApiOperation({ summary: 'Sign out and revoke all access tokens for the account' })
  logout(@CurrentUser() user: JwtPayload): Promise<{ success: boolean }> {
    return this.authService.logout(user.sub);
  }
}
