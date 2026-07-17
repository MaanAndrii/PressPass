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
import type { Card } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

import type { JwtPayload } from '../auth/auth.types';
import { mapCard } from '../common/card.mapper';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import type { BlockCardDto, RenewCardDto } from './dto/card-action.dto';
import type { CreateCardDto } from './dto/create-card.dto';
import type { UpdateCardDto } from './dto/update-card.dto';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly qrToken: QrTokenService,
    private readonly editorialGrants: EditorialKeyGrantService,
  ) {}

  /** Свіжий динамічний QR для адміністратора (кнопка «Перевірка»). */
  async getQr(id: number, actor: JwtPayload, baseUrl = this.verifyBaseUrl): Promise<CardQr> {
    const card = await this.ensureExists(id);
    this.assertManages(card, actor);
    const token = await this.qrToken.sign(card.uuid);
    return {
      verifyUrl: buildVerifyUrl(baseUrl, card.uuid, token),
      expiresInSeconds: this.qrToken.ttlSeconds,
    };
  }

  /** Configured verify base URL; used as a fallback when the host is unknown. */
  get verifyBaseUrl(): string {
    return this.config.get<string>('VERIFY_BASE_URL', 'https://id.domain.ua');
  }

  async findAll(actor: JwtPayload, baseUrl = this.verifyBaseUrl): Promise<CardResponse[]> {
    const cards = await this.prisma.card.findMany({
      // Editorial admins only see cards issued by their own editorial.
      where: actor.role === 'EDITORIAL_ADMIN' ? { editorialId: actor.editorialId } : undefined,
      include: { journalist: true, editorial: true },
      orderBy: { id: 'asc' },
    });
    return cards.map((card) => mapCard(card, baseUrl));
  }

  /** Editorial admins may only act on cards issued by their own editorial. */
  private assertManages(card: Card, actor: JwtPayload): void {
    if (actor.role === 'EDITORIAL_ADMIN' && card.editorialId !== actor.editorialId) {
      throw new ForbiddenException('Це посвідчення видане іншою редакцією');
    }
  }

  /**
   * Issues a new card. The UUID is a UUIDv7 — the only identifier ever
   * embedded in the QR code (no personal data).
   */
  async create(dto: CreateCardDto, actor: JwtPayload): Promise<CardResponse> {
    const journalist = await this.prisma.journalist.findUnique({
      where: { id: dto.journalistId },
    });
    if (!journalist) {
      throw new NotFoundException('Journalist not found');
    }

    // Посвідчення видається виключно від імені доданої редакції. Редакційний
    // адміністратор може видавати лише від своєї редакції — вона підставляється
    // з токена; системний адміністратор вибирає редакцію зі списку.
    const editorialId =
      actor.role === 'EDITORIAL_ADMIN' ? (actor.editorialId ?? undefined) : dto.editorialId;
    if (!editorialId) {
      throw new BadRequestException('Виберіть редакцію, від імені якої видається посвідчення');
    }
    const editorial = await this.prisma.editorial.findUnique({ where: { id: editorialId } });
    if (!editorial) {
      throw new NotFoundException('Editorial not found');
    }

    if (!journalist.fullName) {
      throw new BadRequestException('Перед видачею вкажіть ПІБ журналіста');
    }
    // Посаду для посвідчення заповнює редакція під час видачі.
    if (!dto.position?.trim()) {
      throw new BadRequestException('Вкажіть посаду для посвідчення');
    }
    // Самозареєстровані користувачі спершу заповнюють анкету (ПІП, дата
    // народження, фото, паспортні дані, ІПН, телефон) — вимога процесу видачі.
    if (journalist.selfRegistered && !isProfileComplete(journalist)) {
      throw new BadRequestException(
        'Анкету журналіста не заповнено повністю — посвідчення видати не можна',
      );
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const expireDate = new Date(dto.expireDate);
    if (expireDate.getTime() <= issueDate.getTime()) {
      throw new BadRequestException('expireDate must be after issueDate');
    }

    let cardNumber: string;
    let numberSeq = 0;
    if (dto.cardNumber) {
      cardNumber = dto.cardNumber;
      const existingNumber = await this.prisma.card.findUnique({ where: { cardNumber } });
      if (existingNumber) {
        throw new ConflictException('A card with this number already exists');
      }
    } else {
      ({ cardNumber, numberSeq } = await this.generateCardNumber(editorial, issueDate));
    }

    const card = await this.prisma.card.create({
      data: {
        uuid: uuidv7(),
        journalistId: dto.journalistId,
        editorialId,
        position: dto.position.trim(),
        positionEn: dto.positionEn?.trim() ?? '',
        cardNumber,
        numberSeq,
        issueDate,
        expireDate,
        status: 'ACTIVE',
      },
      include: { journalist: true, editorial: true },
    });
    // A journalist issued a card by an editorial is a member of it (keeps the
    // membership/visibility consistent with the cards that exist).
    await this.prisma.editorialMembership.upsert({
      where: { editorialId_journalistId: { editorialId, journalistId: dto.journalistId } },
      update: {},
      create: { editorialId, journalistId: dto.journalistId },
    });
    await this.editorialGrants.syncFromRecovery(card.journalist.userId);
    return mapCard(card, this.verifyBaseUrl);
  }

  async update(id: number, dto: UpdateCardDto): Promise<CardResponse> {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }

    if (dto.cardNumber && dto.cardNumber !== card.cardNumber) {
      const existingNumber = await this.prisma.card.findUnique({
        where: { cardNumber: dto.cardNumber },
      });
      if (existingNumber) {
        throw new ConflictException('A card with this number already exists');
      }
    }

    const updated = await this.prisma.card.update({
      where: { id },
      data: {
        cardNumber: dto.cardNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : undefined,
        status: dto.status,
      },
      include: { journalist: true, editorial: true },
    });
    return mapCard(updated, this.verifyBaseUrl);
  }

  /** Revokes a card. A blocked card fails public verification immediately. */
  async block(dto: BlockCardDto, actor: JwtPayload): Promise<CardResponse> {
    this.assertManages(await this.ensureExists(dto.cardId), actor);
    const card = await this.prisma.card.update({
      where: { id: dto.cardId },
      data: { status: 'BLOCKED' },
      include: { journalist: true, editorial: true },
    });
    return mapCard(card, this.verifyBaseUrl);
  }

  /** Extends a card's validity and reactivates it (including blocked ones). */
  async renew(dto: RenewCardDto, actor: JwtPayload): Promise<CardResponse> {
    const card = await this.ensureExists(dto.cardId);
    this.assertManages(card, actor);
    const expireDate = new Date(dto.expireDate);
    if (expireDate.getTime() <= card.issueDate.getTime()) {
      throw new BadRequestException('expireDate must be after issueDate');
    }
    const updated = await this.prisma.card.update({
      where: { id: dto.cardId },
      data: { expireDate, status: 'ACTIVE' },
      include: { journalist: true, editorial: true },
    });
    return mapCard(updated, this.verifyBaseUrl);
  }

  /** Permanently deletes an issued card. Editorial admins: own cards only. */
  async remove(id: number, actor: JwtPayload): Promise<{ success: boolean }> {
    this.assertManages(await this.ensureExists(id), actor);
    await this.prisma.card.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: number) {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  /**
   * Builds the next human-readable card number for the issuing editorial.
   *
   * With a configured prefix the number follows the editorial's own template
   * (e.g. `KV-2026-000042`) and the sequence resets each year, scoped to the
   * editorial (distinct prefixes keep editorials from colliding). Without a
   * prefix it falls back to the legacy global scheme `PP-<year>-<seq>`. Either
   * way it advances past any taken number, so deletions/manual numbers never
   * collide with a live one, and the globally-unique column is the final guard.
   */
  private async generateCardNumber(
    editorial: {
      id: number;
      cardNumberPrefix: string;
      cardNumberTemplate: string;
      mediaId: string;
    },
    issueDate: Date,
  ): Promise<{ cardNumber: string; numberSeq: number }> {
    const year = issueDate.getUTCFullYear();
    const prefix = editorial.cardNumberPrefix.trim();

    if (!prefix) {
      // Legacy global numbering (shared across editorials), kept for back-compat.
      const legacyPrefix = `PP-${year}-`;
      const last = await this.prisma.card.findFirst({
        where: { cardNumber: { startsWith: legacyPrefix } },
        orderBy: { cardNumber: 'desc' },
        select: { cardNumber: true },
      });
      let next = last ? Number(last.cardNumber.slice(legacyPrefix.length)) + 1 : 1;
      const legacyFormat = (n: number) => `${legacyPrefix}${String(n).padStart(6, '0')}`;
      while (await this.prisma.card.findUnique({ where: { cardNumber: legacyFormat(next) } })) {
        next += 1;
      }
      return { cardNumber: legacyFormat(next), numberSeq: next };
    }

    // Per-editorial, per-year sequence (derived from the max stored seq).
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYear = new Date(Date.UTC(year + 1, 0, 1));
    const top = await this.prisma.card.findFirst({
      where: { editorialId: editorial.id, issueDate: { gte: yearStart, lt: nextYear } },
      orderBy: { numberSeq: 'desc' },
      select: { numberSeq: true },
    });
    let seq = (top?.numberSeq ?? 0) + 1;
    const render = (n: number) =>
      renderCardNumber(editorial.cardNumberTemplate, {
        prefix,
        year,
        seq: n,
        mediaId: editorial.mediaId,
      });
    // Advance past any number already taken (manual entries, template changes).
    while (await this.prisma.card.findUnique({ where: { cardNumber: render(seq) } })) {
      seq += 1;
    }
    return { cardNumber: render(seq), numberSeq: seq };
  }
}
