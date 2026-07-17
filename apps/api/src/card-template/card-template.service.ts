import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_CARD_TEMPLATE, sanitizeCardTemplate, type CardTemplate } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
const GLOBAL_ID = 1;
@Injectable()
export class CardTemplateService {
  private readonly publicCache = new Map<string, CardTemplate>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
  ) {}
  async get(editorialId?: number | null): Promise<CardTemplate> {
    const cacheKey = editorialId == null ? 'system' : `editorial:${editorialId}`;
    const cached = this.publicCache.get(cacheKey);
    if (cached) return cached;
    if (editorialId != null) {
      const own = await this.prisma.cardTemplate.findUnique({ where: { editorialId } });
      if (own && !own.encryptedData) return sanitizeCardTemplate(own.data);
    }
    const global = await this.prisma.cardTemplate.findUnique({ where: { id: GLOBAL_ID } });
    return global && !global.encryptedData
      ? sanitizeCardTemplate(global.data)
      : DEFAULT_CARD_TEMPLATE;
  }
  async update(
    input: unknown,
    editorialId: number | null | undefined,
    userId: number,
    token?: string,
  ): Promise<CardTemplate> {
    const template = sanitizeCardTemplate(input);
    const target = editorialId == null ? 'system' : `editorial:${editorialId}`;
    const key = this.key(userId, target, token);
    try {
      const encryptedData = this.payloads.encrypt(
        'card-template',
        editorialId ?? GLOBAL_ID,
        target === 'system' ? 'system:1' : target,
        { template },
        key,
      );
      if (editorialId != null)
        await this.prisma.cardTemplate.upsert({
          where: { editorialId },
          update: { encryptedData, data: {} },
          create: { editorialId, encryptedData, data: {} },
        });
      else
        await this.prisma.cardTemplate.upsert({
          where: { id: GLOBAL_ID },
          update: { encryptedData, data: {} },
          create: { id: GLOBAL_ID, encryptedData, data: {} },
        });
      this.publicCache.set(target, template);
      return template;
    } finally {
      key.fill(0);
    }
  }
  async reset(
    editorialId: number | null | undefined,
    userId: number,
    token?: string,
  ): Promise<CardTemplate> {
    if (editorialId != null) {
      await this.prisma.cardTemplate.deleteMany({ where: { editorialId } });
      this.publicCache.delete(`editorial:${editorialId}`);
      return this.get(editorialId);
    }
    return this.update(DEFAULT_CARD_TEMPLATE, null, userId, token);
  }
  async unlock(editorialId: number | null, userId: number, token?: string): Promise<CardTemplate> {
    const target = editorialId == null ? 'system' : `editorial:${editorialId}`;
    const key = this.key(userId, target, token);
    try {
      const row =
        editorialId == null
          ? await this.prisma.cardTemplate.findUnique({ where: { id: 1 } })
          : await this.prisma.cardTemplate.findUnique({ where: { editorialId } });
      if (!row?.encryptedData) return this.get(editorialId);
      const data = this.payloads.decrypt<{ template: unknown }>(
        'card-template',
        editorialId ?? 1,
        target === 'system' ? 'system:1' : target,
        row.encryptedData,
        key,
      );
      const template = sanitizeCardTemplate(data.template);
      this.publicCache.set(target, template);
      return template;
    } finally {
      key.fill(0);
    }
  }
  private key(userId: number, target: string, token?: string): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.sessions.key(token, userId, target);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
}
