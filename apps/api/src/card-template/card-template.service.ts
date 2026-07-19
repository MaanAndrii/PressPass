import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_CARD_TEMPLATE, sanitizeCardTemplate, type CardTemplate } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';

const GLOBAL_ID = 1;

/**
 * Card design templates. A design is PUBLIC by nature — it is printed on every
 * credential and shown on the verify page — so it is stored in the clear and
 * served without a key. This also means it survives an API restart, unlike the
 * previous encrypted storage that relied on a volatile in-memory cache (which,
 * once lost on restart, silently fell back to the default design).
 */
@Injectable()
export class CardTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async get(editorialId?: number | null): Promise<CardTemplate> {
    if (editorialId != null) {
      const own = await this.prisma.cardTemplate.findUnique({ where: { editorialId } });
      const ownTemplate = readTemplate(own?.data);
      if (ownTemplate) return ownTemplate;
    }
    const global = await this.prisma.cardTemplate.findUnique({ where: { id: GLOBAL_ID } });
    return readTemplate(global?.data) ?? DEFAULT_CARD_TEMPLATE;
  }

  async update(input: unknown, editorialId: number | null | undefined): Promise<CardTemplate> {
    const template = sanitizeCardTemplate(input);
    const data = template as unknown as Prisma.InputJsonValue;
    if (editorialId != null)
      await this.prisma.cardTemplate.upsert({
        where: { editorialId },
        update: { data, encryptedData: Prisma.DbNull },
        create: { editorialId, data },
      });
    else
      await this.prisma.cardTemplate.upsert({
        where: { id: GLOBAL_ID },
        update: { data, encryptedData: Prisma.DbNull },
        create: { id: GLOBAL_ID, data },
      });
    return template;
  }

  async reset(editorialId: number | null | undefined): Promise<CardTemplate> {
    if (editorialId != null) {
      await this.prisma.cardTemplate.deleteMany({ where: { editorialId } });
      return this.get(editorialId);
    }
    return this.update(DEFAULT_CARD_TEMPLATE, null);
  }
}

/** Sanitized template from a stored JSON value, or null when empty/absent. */
function readTemplate(data: unknown): CardTemplate | null {
  if (!data || typeof data !== 'object' || Object.keys(data as object).length === 0) return null;
  return sanitizeCardTemplate(data);
}
