import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DEFAULT_CARD_TEMPLATE, sanitizeCardTemplate, type CardTemplate } from '@presspass/shared';

import { PrismaService } from '../prisma/prisma.service';

/** CardTemplate is a plain JSON object; cast for Prisma's Json column type. */
function asJson(template: CardTemplate): Prisma.InputJsonValue {
  return template as unknown as Prisma.InputJsonValue;
}

/** The id of the system-wide default template (editorialId = NULL). */
const GLOBAL_ID = 1;

/**
 * Stores and serves card design templates. Each editorial can have its own
 * design; a card resolves to its editorial's template, falling back to the
 * system-wide default (editorialId = NULL) and then the built-in default.
 * Input is always sanitised via the shared validator, so only whitelisted,
 * plain data values are ever persisted (no HTML/JS, no unknown field keys).
 */
@Injectable()
export class CardTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the active template: the editorial's own design if it has one,
   * else the system-wide default, else the built-in default.
   */
  async get(editorialId?: number | null): Promise<CardTemplate> {
    if (editorialId != null) {
      const own = await this.prisma.cardTemplate.findUnique({ where: { editorialId } });
      if (own) {
        return sanitizeCardTemplate(own.data);
      }
    }
    const global = await this.prisma.cardTemplate.findUnique({ where: { id: GLOBAL_ID } });
    return global ? sanitizeCardTemplate(global.data) : DEFAULT_CARD_TEMPLATE;
  }

  /** Saves the template for one editorial, or the system default when null. */
  async update(input: unknown, editorialId?: number | null): Promise<CardTemplate> {
    const template = sanitizeCardTemplate(input);
    if (editorialId != null) {
      await this.prisma.cardTemplate.upsert({
        where: { editorialId },
        update: { data: asJson(template) },
        create: { editorialId, data: asJson(template) },
      });
    } else {
      await this.prisma.cardTemplate.upsert({
        where: { id: GLOBAL_ID },
        update: { data: asJson(template) },
        create: { id: GLOBAL_ID, data: asJson(template) },
      });
    }
    return template;
  }

  /**
   * Resets a design. For an editorial this deletes its override so it inherits
   * the system default again; for the system default it restores the built-in.
   */
  async reset(editorialId?: number | null): Promise<CardTemplate> {
    if (editorialId != null) {
      await this.prisma.cardTemplate.deleteMany({ where: { editorialId } });
      return this.get(editorialId);
    }
    await this.prisma.cardTemplate.upsert({
      where: { id: GLOBAL_ID },
      update: { data: asJson(DEFAULT_CARD_TEMPLATE) },
      create: { id: GLOBAL_ID, data: asJson(DEFAULT_CARD_TEMPLATE) },
    });
    return DEFAULT_CARD_TEMPLATE;
  }
}
