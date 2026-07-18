import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@presspass/shared';

import { generateJournalistPublicId } from '../common/public-id';
import { BlindIndexService } from '../crypto/blind-index.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
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
    private readonly blindIndexes: BlindIndexService,
    private readonly settings: SettingsService,
  ) {}

  get enabled(): boolean {
    return this.settings.googleEnabled();
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
      client_id: this.settings.googleClientId(),
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
        client_id: this.settings.googleClientId(),
        client_secret: this.settings.googleClientSecret(),
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      this.logger.error(`Google token exchange failed: ${await tokenResponse.text()}`);
      throw new BadRequestException('Google sign-in failed');
    }

    const { id_token: idToken } = (await tokenResponse.json()) as { id_token?: string };
    const payload = await this.verifyIdToken(idToken);
    if (!payload.email || payload.email_verified === false) {
      throw new BadRequestException('Google account has no verified email');
    }

    const user = await this.findOrCreateUser(payload);
    const jwt: JwtPayload = {
      sub: user.id,
      email: this.blindIndexes.normalizeEmail(payload.email),
      role: user.role as Role,
      editorialId: user.editorialId,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(jwt);
    return `${this.siteBaseUrl}/auth/callback#token=${encodeURIComponent(accessToken)}&enrollment=${user.dataKeyEnvelope ? '0' : '1'}&user=${user.id}&role=${user.role}&editorial=${user.editorialId ?? ''}`;
  }

  private async verifyIdToken(idToken: string | undefined): Promise<GoogleIdTokenPayload> {
    if (!idToken) throw new BadRequestException('Google sign-in failed');
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!response.ok) throw new BadRequestException('Invalid Google ID token');
    const payload = (await response.json()) as GoogleIdTokenPayload & {
      aud?: string;
      iss?: string;
    };
    const issuerValid =
      payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    if (payload.aud !== this.settings.googleClientId() || !issuerValid) {
      throw new BadRequestException('Invalid Google ID token');
    }
    return payload;
  }

  private async findOrCreateUser(payload: GoogleIdTokenPayload) {
    const email = this.blindIndexes.normalizeEmail(payload.email!);
    const emailBlindIndex = this.blindIndexes.email(email);

    const googleIdBlindIndex = this.blindIndexes.value('google-id', payload.sub);
    const byGoogleId = await this.prisma.user.findFirst({
      where: { OR: [{ googleIdBlindIndex }, { googleId: payload.sub }] },
    });
    if (byGoogleId) {
      return byGoogleId;
    }

    const byEmail = await this.prisma.user.findFirst({
      where: { OR: [{ emailBlindIndex }, { email }] },
    });
    if (byEmail) {
      // Той самий email, зареєстрований паролем: привʼязуємо Google-акаунт.
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: googleIdBlindIndex,
          googleIdBlindIndex,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: emailBlindIndex,
        emailBlindIndex,
        googleId: googleIdBlindIndex,
        googleIdBlindIndex,
        role: 'JOURNALIST',
        emailVerifiedAt: new Date(),
        journalist: {
          create: {
            selfRegistered: true,
            fullName: '',
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
