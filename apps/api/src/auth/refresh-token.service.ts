import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

/** The refresh cookie name and the raw token returned to the caller once. */
export const REFRESH_COOKIE = 'pp_refresh';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Rotating, sliding refresh tokens for PWA "stay signed in". Only a SHA-256 hash
 * of the opaque token is stored (a database dump cannot authenticate), and every
 * token is bound to the owner's `tokenVersion`, so bumping it ("sign out of all
 * devices") invalidates every device at once. Each use rotates the token and
 * slides the 7-day window forward.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get lifetimeMs(): number {
    const days = Number(this.config.get('REFRESH_TOKEN_DAYS', 7));
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Issues a fresh refresh token for a user/device and stores only its hash. */
  async issue(userId: number, tokenVersion: number, label?: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.lifetimeMs);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(token),
        userId,
        tokenVersion,
        label: label?.slice(0, 80) || null,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /** Issues a refresh token, binding it to the user's current tokenVersion. */
  async issueForUser(userId: number, label?: string): Promise<IssuedRefreshToken> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    return this.issue(userId, user.tokenVersion, label);
  }

  /**
   * Validates and rotates a refresh token: the old one is deleted and a new one
   * issued (sliding window). Returns null when the token is unknown, expired, or
   * its tokenVersion no longer matches the user (signed out everywhere).
   */
  async rotate(
    rawToken: string | undefined,
  ): Promise<{ userId: number; tokenVersion: number; issued: IssuedRefreshToken } | null> {
    if (!rawToken) return null;
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
    });
    if (!existing) return null;
    // Always consume the presented token so a stolen/replayed one cannot be reused.
    await this.prisma.refreshToken.delete({ where: { id: existing.id } }).catch(() => undefined);
    if (existing.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== existing.tokenVersion) return null;
    const issued = await this.issue(
      existing.userId,
      user.tokenVersion,
      existing.label ?? undefined,
    );
    return { userId: existing.userId, tokenVersion: user.tokenVersion, issued };
  }

  /** Revokes a single device's token (sign out on this device). */
  async revoke(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken
      .deleteMany({ where: { tokenHash: this.hash(rawToken) } })
      .catch(() => undefined);
  }

  /** Revokes every refresh token for a user (sign out of all devices). */
  async revokeAll(userId: number): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  /** Cookie options for the refresh token (path-scoped to the auth routes). */
  cookieOptions(secure: boolean, expiresAt?: Date) {
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/api/auth',
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }
}
