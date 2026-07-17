import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, Role } from '@presspass/shared';
import * as argon2 from 'argon2';

import { mapJournalist } from '../common/journalist.mapper';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly editorialGrants: EditorialKeyGrantService,
  ) {}

  /**
   * Verifies credentials and issues a JWT access token.
   * The same generic error is returned for unknown emails, wrong passwords
   * and Google-only accounts, so the endpoint cannot enumerate accounts.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { journalist: { include: { memberships: { include: { editorial: true } } } } },
    });
    // Акаунти, створені через Google, не мають пароля.
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

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
          if (!user.recoveryKeyEnvelope) {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { recoveryKeyEnvelope: this.userKeys.createRecoveryGrant(user.id, dataKey) },
            });
          }
          await this.editorialGrants.sync(
            user.id,
            user.journalist?.memberships.map((membership) => membership.editorial.id) ?? [],
            dataKey,
          );
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
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role as Role,
        emailVerified: true,
        editorialId: user.editorialId,
        journalist: user.journalist ? mapJournalist(user.journalist) : null,
        memberships:
          user.journalist?.memberships.map((m) => ({
            id: m.editorial.id,
            name: m.editorial.name,
          })) ?? [],
      },
    };
  }

  async logout(userId: number): Promise<{ success: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }
}
