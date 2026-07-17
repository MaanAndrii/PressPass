import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  buildVerifyUrl,
  type CardQr,
  type CardResponse,
  type Role,
  type UserProfile,
} from '@presspass/shared';

import { mapCard } from '../common/card.mapper';
import { mapJournalist } from '../common/journalist.mapper';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly qrToken: QrTokenService,
    private readonly userKeys: UserKeyMaterialService,
  ) {}

  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        journalist: {
          include: { memberships: { include: { editorial: true } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      emailVerified: Boolean(user.emailVerifiedAt),
      editorialId: user.editorialId,
      journalist: user.journalist ? mapJournalist(user.journalist) : null,
      // Media the journalist belongs to (shown in the cabinet as confirmation).
      memberships:
        user.journalist?.memberships.map((m) => ({ id: m.editorial.id, name: m.editorial.name })) ??
        [],
    };
  }

  /** Заповнення/оновлення анкети журналістом (після реєстрації). */
  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<UserProfile> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    await this.prisma.journalist.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        fullNameEn: dto.fullNameEn ?? undefined,
        birthDate: new Date(dto.birthDate),
        passportData: dto.passportData,
        taxNumber: dto.taxNumber,
        phone: dto.phone,
      },
    });
    return this.getProfile(userId);
  }

  /** Самостійне завантаження фото (шлях зберігається в БД, файл — на диску). */
  async setOwnPhoto(userId: number, photoPath: string): Promise<UserProfile> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    await this.prisma.journalist.update({ where: { userId }, data: { photoPath } });
    return this.getProfile(userId);
  }

  /** Changes the authenticated user's password after verifying the current one. */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.passwordHash) {
      throw new BadRequestException('Для цього акаунта пароль не встановлено (вхід через Google)');
    }
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException('Поточний пароль вказано невірно');
    }

    let keyMaterial = {};
    const hasPasswordKdf = user.passwordKdf != null;
    const hasDataKeyEnvelope = user.dataKeyEnvelope != null;
    if (hasPasswordKdf && hasDataKeyEnvelope) {
      try {
        keyMaterial = await this.userKeys.rewrap(
          user.id,
          currentPassword,
          newPassword,
          user.passwordKdf,
          user.dataKeyEnvelope,
        );
      } catch {
        throw new InternalServerErrorException('Не вдалося оновити ключ шифрування');
      }
    } else if (hasPasswordKdf || hasDataKeyEnvelope) {
      throw new InternalServerErrorException('Дані ключа шифрування пошкоджені');
    } else {
      keyMaterial = await this.userKeys.provision(user.id, newPassword);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(newPassword),
        ...keyMaterial,
        tokenVersion: { increment: 1 },
      },
    });
    return { success: true };
  }

  /** Configured verify base URL; used as a fallback when the host is unknown. */
  get verifyBaseUrl(): string {
    return this.config.get<string>('VERIFY_BASE_URL', 'https://id.domain.ua');
  }

  /**
   * All cards the journalist holds, ordered for display: their chosen primary
   * first, then valid (ACTIVE) ones newest-first, then the rest. Each is flagged
   * with `isPrimary` so the app can highlight it.
   */
  async getCards(userId: number, baseUrl = this.verifyBaseUrl): Promise<CardResponse[]> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    const cards = await this.prisma.card.findMany({
      where: { journalistId: journalist.id },
      orderBy: { issueDate: 'desc' },
      include: { journalist: true, editorial: true },
    });
    const primaryId = journalist.primaryCardId;
    const mapped = cards.map((card) => ({
      ...mapCard(card, baseUrl),
      isPrimary: card.id === primaryId,
    }));
    const rank = (c: (typeof mapped)[number]) => (c.isPrimary ? 0 : c.status === 'ACTIVE' ? 1 : 2);
    return mapped.sort((a, b) => rank(a) - rank(b));
  }

  /** Sets the journalist's primary card (must be one of their own). */
  async setPrimaryCard(
    userId: number,
    cardId: number,
    baseUrl = this.verifyBaseUrl,
  ): Promise<CardResponse[]> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.journalistId !== journalist.id) {
      throw new NotFoundException('Card not found');
    }
    await this.prisma.journalist.update({
      where: { id: journalist.id },
      data: { primaryCardId: cardId },
    });
    return this.getCards(userId, baseUrl);
  }

  /** Returns the journalist's current card: their primary, else the newest. */
  async getCard(userId: number, baseUrl = this.verifyBaseUrl): Promise<CardResponse> {
    const cards = await this.getCards(userId, baseUrl);
    const card = cards[0];
    if (!card) {
      throw new NotFoundException('No card issued yet');
    }
    return card;
  }

  /**
   * Свіжий динамічний QR: URL перевірки з підписаним короткоживучим токеном.
   * Клієнт запитує його кожні ~30 секунд — старі QR перестають діяти.
   */
  async getCardQr(userId: number, baseUrl = this.verifyBaseUrl, cardId?: number): Promise<CardQr> {
    const card = await this.findOwnCard(userId, cardId);
    const token = await this.qrToken.sign(card.uuid);
    return {
      verifyUrl: buildVerifyUrl(baseUrl, card.uuid, token),
      expiresInSeconds: this.qrToken.ttlSeconds,
    };
  }

  /** The journalist's card by id (must be their own), else their newest one. */
  private async findOwnCard(userId: number, cardId?: number) {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    const card = cardId
      ? await this.prisma.card.findUnique({ where: { id: cardId } })
      : await this.prisma.card.findFirst({
          where: { journalistId: journalist.id },
          orderBy: { issueDate: 'desc' },
        });
    if (!card || card.journalistId !== journalist.id) {
      throw new NotFoundException('No card issued yet');
    }
    return card;
  }
}
