import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildVerifyUrl,
  isProfileComplete,
  renderCardNumber,
  type CardQr,
  type CardResponse,
} from '@presspass/shared';
import type { Card, Editorial, Journalist } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type { JwtPayload } from '../auth/auth.types';
import { mapCard } from '../common/card.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import { QrProjectionCacheService } from '../qr/qr-projection-cache.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import type { BlockCardDto, RenewCardDto } from './dto/card-action.dto';
import type { CreateCardDto } from './dto/create-card.dto';
import type { UpdateCardDto } from './dto/update-card.dto';

type FullCard = Card & { journalist: Journalist; editorial: Editorial | null };
interface CardSecret {
  cardNumber: string;
  position: string;
  positionEn: string;
  issueDate: string;
  expireDate: string;
  editorialSnapshot?: Record<string, unknown>;
}
@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly qrToken: QrTokenService,
    private readonly qrProjections: QrProjectionCacheService,
    private readonly sessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
    private readonly hierarchy: KeyHierarchyService,
    private readonly blind: BlindIndexService,
    private readonly files: EncryptedFileService,
  ) {}
  get verifyBaseUrl(): string {
    return this.config.get<string>('VERIFY_BASE_URL', 'https://id.domain.ua');
  }

  async getQr(
    id: number,
    actor: JwtPayload,
    baseUrl = this.verifyBaseUrl,
    unlock?: string,
  ): Promise<CardQr> {
    const raw = await this.prisma.card.findUnique({
      where: { id },
      include: { journalist: true, editorial: true },
    });
    if (!raw) throw new NotFoundException('Card not found');
    this.assertManages(raw, actor);
    const card = await this.hydrate(raw, actor, unlock);
    // Store the projection server-side; the QR carries only a short id so it
    // stays low-density and scans (the public verify endpoint resolves it).
    const token = this.qrProjections.put(
      card.uuid,
      {
        cardNumber: card.cardNumber,
        expireDate: card.expireDate!.toISOString(),
        fullName: card.journalist.fullName,
        fullNameEn: card.journalist.fullNameEn,
        position: card.position,
        organization: card.editorial?.displayNameUk || card.editorial?.name || '',
        photoPath: null,
        editorial: card.editorial
          ? {
              id: card.editorial.id,
              name: card.editorial.name,
              displayNameUk: card.editorial.displayNameUk,
              displayNameEn: card.editorial.displayNameEn,
              mediaId: card.editorial.mediaId,
              website: card.editorial.website,
              logoPath: null,
            }
          : null,
        nszhuMember: card.journalist.nszhuMember,
        nszhuLogoPath: null,
      },
      this.qrToken.ttlSeconds,
    );
    return {
      verifyUrl: buildVerifyUrl(baseUrl, card.uuid, token),
      expiresInSeconds: this.qrToken.ttlSeconds,
    };
  }
  async findAll(
    actor: JwtPayload,
    baseUrl = this.verifyBaseUrl,
    unlock?: string,
  ): Promise<CardResponse[]> {
    const cards = await this.prisma.card.findMany({
      where: actor.role === 'EDITORIAL_ADMIN' ? { editorialId: actor.editorialId } : undefined,
      include: { journalist: true, editorial: true },
      orderBy: { id: 'asc' },
    });
    const result: CardResponse[] = [];
    for (const card of cards)
      result.push(mapCard(await this.hydrate(card, actor, unlock), baseUrl));
    return result;
  }
  async create(dto: CreateCardDto, actor: JwtPayload, unlock?: string): Promise<CardResponse> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id: dto.journalistId } });
    if (!journalist) throw new NotFoundException('Journalist not found');
    const editorialId = actor.role === 'EDITORIAL_ADMIN' ? actor.editorialId : dto.editorialId;
    if (!editorialId)
      throw new BadRequestException('Виберіть редакцію, від імені якої видається посвідчення');
    const editorial = await this.prisma.editorial.findUnique({ where: { id: editorialId } });
    if (!editorial) throw new NotFoundException('Editorial not found');
    const editorialKey = this.key(actor, unlock, editorialId);
    let profileKey: Buffer | undefined;
    try {
      const hydratedEditorial = this.decryptEditorial(editorial, editorialKey);
      profileKey = await this.profileKeyForEditorial(journalist, editorialId, editorialKey);
      const hydratedJournalist = this.decryptJournalistWithKey(journalist, profileKey);
      if (!hydratedJournalist.fullName)
        throw new BadRequestException('Перед видачею вкажіть ПІБ журналіста');
      if (!dto.position?.trim()) throw new BadRequestException('Вкажіть посаду для посвідчення');
      if (hydratedJournalist.selfRegistered && !isProfileComplete(hydratedJournalist))
        throw new BadRequestException(
          'Анкету журналіста не заповнено повністю — посвідчення видати не можна',
        );
      const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
      const expireDate = new Date(dto.expireDate);
      if (expireDate <= issueDate)
        throw new BadRequestException('expireDate must be after issueDate');
      let cardNumber: string;
      let numberSeq = 0;
      if (dto.cardNumber) {
        cardNumber = dto.cardNumber.trim();
        await this.assertNumberFree(cardNumber);
      } else
        ({ cardNumber, numberSeq } = await this.generateCardNumber(hydratedEditorial, issueDate));
      const uuid = uuidv7();
      const created = await this.prisma.card.create({
        data: {
          uuid,
          journalistId: journalist.id,
          editorialId,
          status: 'ACTIVE',
          numberSeq,
          cardNumber: `encrypted:${uuid}`,
          cardNumberBlindIndex: this.blind.value('card-number', cardNumber),
          position: '',
          positionEn: '',
          issueDate: null,
          expireDate: null,
        },
        include: { journalist: true, editorial: true },
      });
      let cardLogoPath: string | null = null;
      const editorialLogoId = hydratedEditorial.logoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
      if (editorialLogoId) {
        const logo = await this.files.read(editorialLogoId, editorialKey);
        const copyId = await this.files.store({
          ownerType: 'user',
          ownerId: String(journalist.userId),
          purpose: `card-logo:${created.id}`,
          mimeType: logo.mimeType,
          bytes: logo.bytes,
          ownerKey: profileKey,
        });
        cardLogoPath = `/media/${copyId}`;
      }
      const secret: CardSecret = {
        cardNumber,
        position: dto.position.trim(),
        positionEn: dto.positionEn?.trim() ?? '',
        issueDate: issueDate.toISOString(),
        expireDate: expireDate.toISOString(),
        editorialSnapshot: {
          name: hydratedEditorial.name,
          displayNameUk: hydratedEditorial.displayNameUk,
          displayNameEn: hydratedEditorial.displayNameEn,
          mediaId: hydratedEditorial.mediaId,
          website: hydratedEditorial.website,
          logoPath: cardLogoPath,
        },
      };
      const secured = await this.prisma.card.update({
        where: { id: created.id },
        data: {
          encryptedData: this.payloads.encrypt(
            'card',
            created.id,
            `user:${journalist.userId}`,
            secret,
            profileKey,
          ),
        },
        include: { journalist: true, editorial: true },
      });
      return mapCard(
        this.mergeCard(secured, secret, hydratedJournalist, hydratedEditorial),
        this.verifyBaseUrl,
      );
    } finally {
      editorialKey.fill(0);
      profileKey?.fill(0);
    }
  }
  async update(
    id: number,
    dto: UpdateCardDto,
    actor?: JwtPayload,
    unlock?: string,
  ): Promise<CardResponse> {
    const raw = await this.prisma.card.findUnique({
      where: { id },
      include: { journalist: true, editorial: true },
    });
    if (!raw?.editorialId || !actor) throw new NotFoundException('Card not found');
    this.assertManages(raw, actor);
    const key = this.key(actor, unlock, raw.editorialId);
    let profile: Buffer | undefined;
    try {
      profile = await this.profileKeyForEditorial(raw.journalist, raw.editorialId, key);
      const current = this.cardSecret(raw, profile);
      const next: CardSecret = {
        ...current,
        ...(dto.cardNumber ? { cardNumber: dto.cardNumber.trim() } : {}),
        ...(dto.issueDate ? { issueDate: new Date(dto.issueDate).toISOString() } : {}),
        ...(dto.expireDate ? { expireDate: new Date(dto.expireDate).toISOString() } : {}),
      };
      if (dto.cardNumber && dto.cardNumber !== current.cardNumber)
        await this.assertNumberFree(dto.cardNumber);
      const updated = await this.prisma.card.update({
        where: { id },
        data: {
          status: dto.status,
          cardNumberBlindIndex: this.blind.value('card-number', next.cardNumber),
          encryptedData: this.payloads.encrypt(
            'card',
            id,
            `user:${raw.journalist.userId}`,
            next,
            profile,
          ),
        },
        include: { journalist: true, editorial: true },
      });
      return mapCard(await this.hydrate(updated, actor, unlock, key), this.verifyBaseUrl);
    } finally {
      key.fill(0);
      profile?.fill(0);
    }
  }
  async block(dto: BlockCardDto, actor: JwtPayload, unlock?: string): Promise<CardResponse> {
    const raw = await this.ensureExists(dto.cardId);
    this.assertManages(raw, actor);
    await this.prisma.card.update({ where: { id: dto.cardId }, data: { status: 'BLOCKED' } });
    return this.one(dto.cardId, actor, unlock);
  }
  async renew(dto: RenewCardDto, actor: JwtPayload, unlock?: string): Promise<CardResponse> {
    const raw = await this.prisma.card.findUnique({
      where: { id: dto.cardId },
      include: { journalist: true, editorial: true },
    });
    if (!raw?.editorialId) throw new NotFoundException('Card not found');
    this.assertManages(raw, actor);
    const key = this.key(actor, unlock, raw.editorialId);
    let profile: Buffer | undefined;
    try {
      profile = await this.profileKeyForEditorial(raw.journalist, raw.editorialId, key);
      const secret = this.cardSecret(raw, profile);
      const expire = new Date(dto.expireDate);
      if (expire <= new Date(secret.issueDate))
        throw new BadRequestException('expireDate must be after issueDate');
      secret.expireDate = expire.toISOString();
      await this.prisma.card.update({
        where: { id: raw.id },
        data: {
          status: 'ACTIVE',
          encryptedData: this.payloads.encrypt(
            'card',
            raw.id,
            `user:${raw.journalist.userId}`,
            secret,
            profile,
          ),
        },
      });
      return this.one(raw.id, actor, unlock);
    } finally {
      key.fill(0);
      profile?.fill(0);
    }
  }
  async remove(id: number, actor: JwtPayload): Promise<{ success: boolean }> {
    const card = await this.ensureExists(id);
    this.assertManages(card, actor);
    const journalist = await this.prisma.journalist.findUniqueOrThrow({
      where: { id: card.journalistId },
    });
    await this.files.removePurpose('user', String(journalist.userId), `card-logo:${id}`);
    await this.prisma.card.delete({ where: { id } });
    return { success: true };
  }
  private async one(id: number, actor: JwtPayload, unlock?: string): Promise<CardResponse> {
    const raw = await this.prisma.card.findUniqueOrThrow({
      where: { id },
      include: { journalist: true, editorial: true },
    });
    return mapCard(await this.hydrate(raw, actor, unlock), this.verifyBaseUrl);
  }
  private async hydrate(
    raw: FullCard,
    actor: JwtPayload,
    unlock?: string,
    supplied?: Buffer,
  ): Promise<FullCard> {
    if (!raw.editorialId) return raw;
    const key = supplied ? Buffer.from(supplied) : this.key(actor, unlock, raw.editorialId);
    let profile: Buffer | undefined;
    try {
      profile = await this.profileKeyForEditorial(raw.journalist, raw.editorialId, key);
      const secret = this.cardSecret(raw, profile);
      const journalist = this.decryptJournalistWithKey(raw.journalist, profile);
      const editorial = raw.editorial ? this.decryptEditorial(raw.editorial, key) : null;
      return this.mergeCard(raw, secret, journalist, editorial);
    } finally {
      key.fill(0);
      profile?.fill(0);
    }
  }
  private mergeCard(
    raw: FullCard,
    secret: CardSecret,
    journalist: Journalist,
    editorial: Editorial | null,
  ): FullCard {
    return {
      ...raw,
      ...secret,
      issueDate: new Date(secret.issueDate),
      expireDate: new Date(secret.expireDate),
      journalist,
      editorial,
    } as FullCard;
  }
  private cardSecret(card: Card, key: Buffer): CardSecret {
    if (!card.encryptedData)
      return {
        cardNumber: card.cardNumber,
        position: card.position,
        positionEn: card.positionEn,
        issueDate: card.issueDate!.toISOString(),
        expireDate: card.expireDate!.toISOString(),
      };
    return this.payloads.decrypt(
      'card',
      card.id,
      `user:${(card as Card & { journalist?: Journalist }).journalist?.userId ?? 'unknown'}`,
      card.encryptedData,
      key,
    );
  }
  private decryptEditorial(editorial: Editorial, key: Buffer): Editorial {
    return editorial.encryptedData
      ? {
          ...editorial,
          ...this.payloads.decrypt<object>(
            'editorial',
            editorial.id,
            `editorial:${editorial.id}`,
            editorial.encryptedData,
            key,
          ),
        }
      : editorial;
  }
  private async profileKeyForEditorial(
    journalist: Journalist,
    editorialId: number,
    editorialKey: Buffer,
  ): Promise<Buffer> {
    const grant = await this.prisma.editorialDataKeyGrant.findUnique({
      where: { userId_editorialId: { userId: journalist.userId, editorialId } },
    });
    if (!grant)
      throw new BadRequestException(
        'Журналіст ще не надав редакції зашифрований доступ до профілю',
      );
    if (grant.keyEnvelope)
      return this.hierarchy.unwrapProfileForEditorial(
        journalist.userId,
        editorialId,
        grant.keyEnvelope,
        editorialKey,
      );
    if (grant.sealedKeyEnvelope) {
      // Consent join before the symmetric grant was materialised: unseal with the
      // Editorial KEK and cache the fast envelope for next time.
      const profileKey = await this.hierarchy.unsealProfileForEditorial(
        editorialId,
        grant.sealedKeyEnvelope,
        editorialKey,
      );
      await this.prisma.editorialDataKeyGrant.update({
        where: { userId_editorialId: { userId: journalist.userId, editorialId } },
        data: {
          keyEnvelope: this.hierarchy.wrapProfileForEditorial(
            journalist.userId,
            editorialId,
            profileKey,
            editorialKey,
          ),
        },
      });
      return profileKey;
    }
    throw new BadRequestException('Журналіст ще не надав редакції зашифрований доступ до профілю');
  }
  private decryptJournalistWithKey(journalist: Journalist, profile: Buffer): Journalist {
    return journalist.encryptedData
      ? {
          ...journalist,
          ...this.payloads.decrypt<object>(
            'journalist',
            journalist.id,
            `user:${journalist.userId}`,
            journalist.encryptedData,
            profile,
          ),
        }
      : journalist;
  }
  private key(actor: JwtPayload, token: string | undefined, editorialId: number): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.sessions.key(token, actor.sub, `editorial:${editorialId}`);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
  private async assertNumberFree(number: string): Promise<void> {
    if (
      await this.prisma.card.findFirst({
        where: {
          OR: [
            { cardNumberBlindIndex: this.blind.value('card-number', number) },
            { cardNumber: number },
          ],
        },
      })
    )
      throw new ConflictException('A card with this number already exists');
  }
  private assertManages(card: Card, actor: JwtPayload): void {
    if (actor.role === 'EDITORIAL_ADMIN' && card.editorialId !== actor.editorialId)
      throw new ForbiddenException('Це посвідчення видане іншою редакцією');
  }
  private async ensureExists(id: number): Promise<Card> {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('Card not found');
    return card;
  }
  private async generateCardNumber(
    editorial: Editorial,
    issueDate: Date,
  ): Promise<{ cardNumber: string; numberSeq: number }> {
    const year = issueDate.getUTCFullYear();
    const prefix = editorial.cardNumberPrefix.trim();
    const top = await this.prisma.card.findFirst({
      where: { editorialId: editorial.id },
      orderBy: { numberSeq: 'desc' },
      select: { numberSeq: true },
    });
    let seq = (top?.numberSeq ?? 0) + 1;
    const render = (n: number) =>
      prefix
        ? renderCardNumber(editorial.cardNumberTemplate, {
            prefix,
            year,
            seq: n,
            mediaId: editorial.mediaId,
          })
        : `PP-${year}-${String(n).padStart(6, '0')}`;
    while (
      await this.prisma.card.findFirst({
        where: { cardNumberBlindIndex: this.blind.value('card-number', render(seq)) },
      })
    )
      seq += 1;
    return { cardNumber: render(seq), numberSeq: seq };
  }
}
