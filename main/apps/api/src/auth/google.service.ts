import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@presspass/shared';

import { generateJournalistPublicId } from '../common/public-id';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';

interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * "Увійти через Google" (OAuth 2.0 Authorization Code flow).
 *
 * Enabled only when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are configured;
 * the frontend hides the button otherwise (GET /auth/config).
 * The redirect URI must be registered in Google Cloud Console:
 *   {VERIFY_BASE_URL}/api/auth/google/callback
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  private get siteBaseUrl(): string {
    return this.config.get<string>('VERIFY_BASE_URL', 'https://id.domain.ua').replace(/\/+$/, '');
  }

  private get redirectUri(): string {
    return this.config.get<string>(
      'GOOGLE_REDIRECT_URI',
      `${this.siteBaseUrl}/api/auth/google/callback`,
    );
  }

  /** Where to send the browser to start the Google sign-in. */
  async buildAuthUrl(): Promise<string> {
    this.ensureEnabled();
    // Короткоживучий підписаний state захищає callback від CSRF.
    const state = await this.jwtService.signAsync(
      { purpose: 'google-oauth' },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID', ''),
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handles the callback: verifies state, exchanges the code, signs the user
   * in (creating the account on first login) and returns the URL of the web
   * app to redirect to, with our JWT in the fragment.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    this.ensureEnabled();
    try {
      await this.jwtService.verifyAsync(state);
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.get<string>('GOOGLE_CLIENT_ID', ''),
        client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET', ''),
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      this.logger.error(`Google token exchange failed: ${await tokenResponse.text()}`);
      throw new BadRequestException('Google sign-in failed');
    }

    // id_token отримано напряму від Google по TLS — підпис перевіряти не потрібно.
    const { id_token: idToken } = (await tokenResponse.json()) as { id_token?: string };
    const payload = this.decodeIdToken(idToken);
    if (!payload.email || payload.email_verified === false) {
      throw new BadRequestException('Google account has no verified email');
    }

    const user = await this.findOrCreateUser(payload);
    const jwt: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      editorialId: user.editorialId,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(jwt);
    return `${this.siteBaseUrl}/auth/callback#token=${encodeURIComponent(accessToken)}`;
  }

  private decodeIdToken(idToken: string | undefined): GoogleIdTokenPayload {
    const body = idToken?.split('.')[1];
    if (!body) {
      throw new BadRequestException('Google sign-in failed');
    }
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as GoogleIdTokenPayload;
  }

  private async findOrCreateUser(payload: GoogleIdTokenPayload) {
    const email = payload.email!.toLowerCase();

    const byGoogleId = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (byGoogleId) {
      return byGoogleId;
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Той самий email, зареєстрований паролем: привʼязуємо Google-акаунт.
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: payload.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
    }

    return this.prisma.user.create({
      data: {
        email,
        googleId: payload.sub,
        role: 'JOURNALIST',
        emailVerifiedAt: new Date(),
        journalist: {
          create: {
            selfRegistered: true,
            fullName: payload.name ?? '',
            publicId: generateJournalistPublicId(),
          },
        },
      },
    });
  }

  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new BadRequestException('Вхід через Google не налаштовано');
    }
  }
}
