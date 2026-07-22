import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginResponse, RegisterResponse, Role } from '@presspass/shared';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';

import { mapJournalist } from '../common/journalist.mapper';
import { generateJournalistPublicId } from '../common/public-id';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Self-registration with email confirmation.
 *
 * Flow: POST /auth/register → 6-digit code emailed (Resend) →
 * POST /auth/verify-email → account activated, JWT issued →
 * the user fills in the questionnaire (PUT /profile) →
 * an administrator can then issue a press card.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly blindIndexes: BlindIndexService,
    private readonly hierarchy: KeyHierarchyService,
  ) {}

  async register(rawEmail: string, password: string): Promise<RegisterResponse> {
    const email = this.blindIndexes.normalizeEmail(rawEmail);
    const passwordHash = await argon2.hash(password);

    const existing = await this.prisma.user.findFirst({
      where: { emailBlindIndex: this.blindIndexes.email(email) },
    });
    // A soft-deleted account keeps its email reserved during the grace window;
    // it is brought back by logging in, not by re-registering over it.
    if (existing?.deletedAt) {
      throw new ConflictException(
        'Цей email нещодавно був видалений і тимчасово зарезервований — увійдіть, щоб відновити акаунт',
      );
    }
    if (existing?.emailVerifiedAt) {
      // Точніше повідомлення: адмінський акаунт не показується у списку
      // журналістів, тож інакше «користувача не видно» збиває з пантелику.
      throw new ConflictException(
        existing.role === 'ADMIN'
          ? 'Цей email належить адміністратору системи — увійдіть під ним'
          : 'Користувач з таким email вже зареєстрований — увійдіть або відновіть пароль',
      );
    }

    if (existing) {
      // Незавершена реєстрація: оновлюємо пароль і надсилаємо новий код.
      const keyMaterial = await this.userKeys.provision(existing.id, password, { email }, (key) =>
        this.hierarchy.wrapOwnerForRecovery('user', String(existing.id), key),
      );
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          emailBlindIndex: this.blindIndexes.email(email),
          passwordHash,
          ...keyMaterial,
        },
      });
      await this.issueCode(existing.id, email);
      return { success: true, message: 'Новий код підтвердження надіслано на вашу пошту' };
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          emailBlindIndex: this.blindIndexes.email(email),
          passwordHash,
          role: 'JOURNALIST',
          journalist: { create: { selfRegistered: true, publicId: generateJournalistPublicId() } },
        },
      });
      const keyMaterial = await this.userKeys.provision(created.id, password, { email }, (key) =>
        this.hierarchy.wrapOwnerForRecovery('user', String(created.id), key, tx),
      );
      await tx.user.update({
        where: { id: created.id },
        data: { ...keyMaterial },
      });
      return created;
    });
    await this.issueCode(user.id, email);
    return { success: true, message: 'Код підтвердження надіслано на вашу пошту' };
  }

  async verifyEmail(rawEmail: string, code: string): Promise<LoginResponse> {
    const email = this.blindIndexes.normalizeEmail(rawEmail);
    const user = await this.prisma.user.findFirst({
      where: { emailBlindIndex: this.blindIndexes.email(email) },
      include: { verification: true, journalist: true },
    });
    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email вже підтверджено — увійдіть у систему');
    }
    const verification = user.verification;
    if (!verification || verification.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Код прострочено — надішліть новий');
    }
    if (verification.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Забагато спроб — надішліть новий код');
    }
    if (verification.code !== this.blindIndexes.verificationCode(user.id, code)) {
      await this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Невірний код');
    }

    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), verification: { delete: true } },
      include: { journalist: true },
    });

    const payload: JwtPayload = {
      sub: verified.id,
      email: verified.emailBlindIndex ?? '',
      role: verified.role as Role,
      editorialId: verified.editorialId,
      tokenVersion: verified.tokenVersion,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: verified.id,
        email: verified.emailBlindIndex ?? '',
        role: verified.role as Role,
        emailVerified: true,
        editorialId: verified.editorialId,
        journalist: verified.journalist ? mapJournalist(verified.journalist) : null,
        // A just-verified journalist belongs to no media yet.
        memberships: [],
      },
    };
  }

  async resendCode(rawEmail: string): Promise<RegisterResponse> {
    const email = this.blindIndexes.normalizeEmail(rawEmail);
    const user = await this.prisma.user.findFirst({
      where: { emailBlindIndex: this.blindIndexes.email(email) },
    });
    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email вже підтверджено — увійдіть у систему');
    }
    await this.issueCode(user.id, email);
    return { success: true, message: 'Новий код підтвердження надіслано на вашу пошту' };
  }

  /** Generates a fresh 6-digit code (replacing any previous one) and emails it. */
  private async issueCode(userId: number, email: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.emailVerification.upsert({
      where: { userId },
      update: {
        code: this.blindIndexes.verificationCode(userId, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        attempts: 0,
      },
      create: {
        userId,
        code: this.blindIndexes.verificationCode(userId, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    await this.mail.sendVerificationCode(email, code);
  }
}
