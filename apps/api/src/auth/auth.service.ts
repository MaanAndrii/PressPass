import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, Role } from '@presspass/shared';
import * as argon2 from 'argon2';

import { mapJournalist } from '../common/journalist.mapper';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly unlockSessions: UnlockSessionService,
    private readonly blindIndexes: BlindIndexService,
    private readonly payloads: DomainPayloadService,
  ) {}

  /**
   * Verifies credentials and issues a JWT access token.
   * The same generic error is returned for unknown emails, wrong passwords
   * and Google-only accounts, so the endpoint cannot enumerate accounts.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { emailBlindIndex: this.safeEmailIndex(email) },
          { email: email.toLowerCase().trim() },
        ],
      },
      include: {
        adminKeyMaterial: true,
        journalist: { include: { memberships: { include: { editorial: true } } } },
      },
    });
    // Акаунти, створені через Google, не мають пароля.
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let unlockedDataKey: Buffer | undefined;
    const hasPasswordKdf = user.passwordKdf != null;
    const hasDataKeyEnvelope = user.dataKeyEnvelope != null;
    if (hasPasswordKdf && hasDataKeyEnvelope) {
      try {
        const dataKey = await this.userKeys.unlock(
          user.id,
          password,
          user.passwordKdf,
          user.dataKeyEnvelope,
        );
        try {
          unlockedDataKey = Buffer.from(dataKey);
        } finally {
          dataKey.fill(0);
        }
      } catch {
        throw new UnauthorizedException('Invalid email or password');
      }
    } else if (hasPasswordKdf || hasDataKeyEnvelope) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      // Стабільний код для фронтенда: він переводить на сторінку підтвердження.
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      editorialId: user.editorialId,
      tokenVersion: user.tokenVersion,
    };
    let displayEmail = user.email;
    let displayJournalist = user.journalist;
    if (unlockedDataKey && user.encryptedData) {
      displayEmail = this.userKeys.decryptUserData<{ email: string }>(
        user.id,
        user.encryptedData,
        unlockedDataKey,
      ).email;
    }
    if (unlockedDataKey && user.journalist?.encryptedData) {
      const data = this.payloads.decrypt<Record<string, unknown>>(
        'journalist',
        user.journalist.id,
        `user:${user.id}`,
        user.journalist.encryptedData,
        unlockedDataKey,
      );
      displayJournalist = { ...user.journalist, ...data } as typeof user.journalist;
    }
    const unlock = unlockedDataKey
      ? this.unlockSessions.create(user.id, new Map([['profile', unlockedDataKey]]))
      : undefined;
    unlockedDataKey?.fill(0);
    return {
      accessToken: await this.jwtService.signAsync(payload),
      unlockToken: unlock?.token,
      unlockExpiresAt: unlock?.expiresAt,
      encryptionEnrollmentRequired:
        user.role === 'JOURNALIST' ? !hasPasswordKdf : !user.adminKeyMaterial,
      user: {
        id: user.id,
        email: displayEmail,
        role: user.role as Role,
        emailVerified: true,
        editorialId: user.editorialId,
        journalist: displayJournalist ? mapJournalist(displayJournalist) : null,
        memberships:
          user.journalist?.memberships.map((m) => ({
            id: m.editorial.id,
            name: m.editorial.name,
          })) ?? [],
      },
    };
  }

  private safeEmailIndex(email: string): string | undefined {
    try {
      return this.blindIndexes.email(email);
    } catch {
      return undefined;
    }
  }

  async logout(userId: number): Promise<{ success: boolean }> {
    this.unlockSessions.revokeUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }
}
