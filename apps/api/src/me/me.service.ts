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
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PublicMediaCacheService } from '../crypto/public-media-cache.service';
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
    private readonly unlockSessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
    private readonly files: EncryptedFileService,
    private readonly publicMedia: PublicMediaCacheService,
  ) {}

  async getProfile(userId: number, unlockToken?: string): Promise<UserProfile> {
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
    let journalist = user.journalist;
    let email = user.email;
    if (user.encryptedData || journalist?.encryptedData) {
      const key = this.profileKey(unlockToken, userId);
      if (user.encryptedData)
        email = this.userKeys.decryptUserData<{ email: string }>(
          userId,
          user.encryptedData,
          key,
        ).email;
      if (journalist?.encryptedData) {
        const data = this.payloads.decrypt<Record<string, unknown>>(
          'journalist',
          journalist.id,
          `user:${userId}`,
          journalist.encryptedData,
          key,
        );
        journalist = { ...journalist, ...data } as typeof journalist;
        const privatePhotoId = journalist.photoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
        if (privatePhotoId) {
          const photo = await this.files.read(privatePhotoId, key);
          journalist = {
            ...journalist,
            photoPath: `/public-media/${this.publicMedia.put(photo.bytes, photo.mimeType, 900)}`,
          };
        }
      }
      key.fill(0);
    }
    return {
      id: user.id,
      email,
      role: user.role as Role,
      emailVerified: Boolean(user.emailVerifiedAt),
      editorialId: user.editorialId,
      journalist: journalist ? mapJournalist(journalist) : null,
      // Media the journalist belongs to (shown in the cabinet as confirmation).
      memberships:
        user.journalist?.memberships.map((m) => ({ id: m.editorial.id, name: m.editorial.name })) ??
        [],
    };
  }

  /** Заповнення/оновлення анкети журналістом (після реєстрації). */
  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    unlockToken?: string,
  ): Promise<UserProfile> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    const key = this.profileKey(unlockToken, userId);
    try {
      const encryptedData = this.payloads.encrypt(
        'journalist',
        journalist.id,
        `user:${userId}`,
        {
          fullName: dto.fullName,
          fullNameEn: dto.fullNameEn ?? '',
          position: journalist.position,
          positionEn: journalist.positionEn,
          organization: journalist.organization,
          organizationEn: journalist.organizationEn,
          photoPath: journalist.photoPath,
          birthDate: dto.birthDate,
          passportData: dto.passportData,
          taxNumber: dto.taxNumber,
          phone: dto.phone,
          nszhuMember: journalist.nszhuMember,
        },
        key,
      );
      await this.prisma.journalist.update({
        where: { userId },
        data: {
          encryptedData,
          fullName: '',
          fullNameEn: '',
          position: '',
          positionEn: '',
          organization: '',
          organizationEn: '',
          birthDate: null,
          passportData: null,
          taxNumber: null,
          phone: null,
          nszhuMember: false,
        },
      });
    } finally {
      key.fill(0);
    }
    return this.getProfile(userId, unlockToken);
  }

  /** Encrypts an uploaded profile photo before durable storage. */
  async setOwnPhoto(
    userId: number,
    bytes: Buffer,
    mimeType: string,
    unlockToken?: string,
  ): Promise<UserProfile> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) throw new NotFoundException('No journalist profile for this user');
    const key = this.profileKey(unlockToken, userId);
    try {
      const fileId = await this.files.store({
        ownerType: 'user',
        ownerId: String(userId),
        purpose: 'profile-photo',
        mimeType,
        bytes,
        ownerKey: key,
      });
      const current = journalist.encryptedData
        ? this.payloads.decrypt<Record<string, unknown>>(
            'journalist',
            journalist.id,
            `user:${userId}`,
            journalist.encryptedData,
            key,
          )
        : {};
      await this.prisma.journalist.update({
        where: { userId },
        data: {
          photoPath: null,
          nszhuMember: false,
          encryptedData: this.payloads.encrypt(
            'journalist',
            journalist.id,
            `user:${userId}`,
            { ...current, photoPath: `/media/${fileId}` },
            key,
          ),
        },
      });
      await this.files.cleanupReplaced('user', String(userId), 'profile-photo', fileId);
    } finally {
      key.fill(0);
    }
    return this.getProfile(userId, unlockToken);
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
    this.unlockSessions.revokeUser(userId);
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
  async getCards(
    userId: number,
    baseUrl = this.verifyBaseUrl,
    unlockToken?: string,
  ): Promise<CardResponse[]> {
    const journalist = await this.prisma.journalist.findUnique({ where: { userId } });
    if (!journalist) {
      throw new NotFoundException('No journalist profile for this user');
    }
    const cards = await this.prisma.card.findMany({
      where: { journalistId: journalist.id },
      orderBy: { id: 'desc' },
      include: { journalist: true, editorial: true },
    });
    const key = this.profileKey(unlockToken, userId);
    let hydratedJournalist = journalist;
    if (journalist.encryptedData)
      hydratedJournalist = {
        ...journalist,
        ...this.payloads.decrypt<object>(
          'journalist',
          journalist.id,
          `user:${userId}`,
          journalist.encryptedData,
          key,
        ),
      };
    const privatePhotoId = hydratedJournalist.photoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
    if (privatePhotoId) {
      const photo = await this.files.read(privatePhotoId, key);
      hydratedJournalist = {
        ...hydratedJournalist,
        photoPath: `/public-media/${this.publicMedia.put(photo.bytes, photo.mimeType, 900)}`,
      };
    }
    const primaryId = journalist.primaryCardId;
    const mapped: CardResponse[] = [];
    for (const card of cards) {
      if (!card.encryptedData) {
        mapped.push({ ...mapCard(card, baseUrl), isPrimary: card.id === primaryId });
        continue;
      }
      const secret = this.payloads.decrypt<{
        cardNumber: string;
        position: string;
        positionEn: string;
        issueDate: string;
        expireDate: string;
        editorialSnapshot?: object;
      }>('card', card.id, `user:${userId}`, card.encryptedData, key);
      let editorial = card.editorial
        ? { ...card.editorial, ...(secret.editorialSnapshot ?? {}) }
        : null;
      const logoId = editorial?.logoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
      if (logoId && editorial) {
        const logo = await this.files.read(logoId, key);
        editorial = {
          ...editorial,
          logoPath: `/public-media/${this.publicMedia.put(logo.bytes, logo.mimeType, 900)}`,
        };
      }
      mapped.push({
        ...mapCard(
          {
            ...card,
            ...secret,
            issueDate: new Date(secret.issueDate),
            expireDate: new Date(secret.expireDate),
            journalist: hydratedJournalist,
            editorial,
          },
          baseUrl,
        ),
        isPrimary: card.id === primaryId,
      });
    }
    key.fill(0);
    const rank = (c: (typeof mapped)[number]) => (c.isPrimary ? 0 : c.status === 'ACTIVE' ? 1 : 2);
    return mapped.sort((a, b) => rank(a) - rank(b));
  }

  /** Sets the journalist's primary card (must be one of their own). */
  async setPrimaryCard(
    userId: number,
    cardId: number,
    baseUrl = this.verifyBaseUrl,
    unlockToken?: string,
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
    return this.getCards(userId, baseUrl, unlockToken);
  }

  /** Returns the journalist's current card: their primary, else the newest. */
  async getCard(
    userId: number,
    baseUrl = this.verifyBaseUrl,
    unlockToken?: string,
  ): Promise<CardResponse> {
    const cards = await this.getCards(userId, baseUrl, unlockToken);
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
  async getCardQr(
    userId: number,
    baseUrl = this.verifyBaseUrl,
    cardId?: number,
    unlockToken?: string,
  ): Promise<CardQr> {
    const cards = await this.getCards(userId, baseUrl, unlockToken);
    const card = cardId ? cards.find((item) => item.id === cardId) : cards[0];
    if (!card) throw new NotFoundException('Card not found');
    let photoPath: string | null = null;
    let qrEditorial = card.editorial;
    const key = this.profileKey(unlockToken, userId);
    try {
      const owner = await this.prisma.journalist.findUniqueOrThrow({ where: { userId } });
      const privatePath = owner.encryptedData
        ? this.payloads.decrypt<{ photoPath?: string }>(
            'journalist',
            owner.id,
            `user:${userId}`,
            owner.encryptedData,
            key,
          ).photoPath
        : owner.photoPath;
      const fileId = privatePath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
      if (fileId) {
        const photo = await this.files.read(fileId, key);
        photoPath = `/public-media/${this.publicMedia.put(photo.bytes, photo.mimeType, this.qrToken.ttlSeconds)}`;
      }
      const rawCard = await this.prisma.card.findUniqueOrThrow({ where: { id: card.id } });
      if (rawCard.encryptedData && qrEditorial) {
        const secret = this.payloads.decrypt<{ editorialSnapshot?: { logoPath?: string | null } }>(
          'card',
          rawCard.id,
          `user:${userId}`,
          rawCard.encryptedData,
          key,
        );
        const logoId = secret.editorialSnapshot?.logoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
        if (logoId) {
          const logo = await this.files.read(logoId, key);
          qrEditorial = {
            ...qrEditorial,
            logoPath: `/public-media/${this.publicMedia.put(logo.bytes, logo.mimeType, this.qrToken.ttlSeconds)}`,
          };
        }
      }
    } finally {
      key.fill(0);
    }
    const token = await this.qrToken.sign(card.uuid, {
      cardNumber: card.cardNumber,
      expireDate: card.expireDate,
      fullName: card.journalist.fullName,
      fullNameEn: card.journalist.fullNameEn,
      position: card.position,
      organization: card.editorial?.displayNameUk || card.editorial?.name || '',
      photoPath,
      editorial: qrEditorial,
      nszhuMember: card.journalist.nszhuMember,
      nszhuLogoPath: null,
    });
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
          orderBy: { id: 'desc' },
        });
    if (!card || card.journalistId !== journalist.id) {
      throw new NotFoundException('No card issued yet');
    }
    return card;
  }
  private profileKey(token: string | undefined, userId: number): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.unlockSessions.key(token, userId, 'profile');
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
}
