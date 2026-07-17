import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppSettings, UpdateSettingsInput } from '@presspass/shared';

import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 1;

/**
 * Runtime-editable settings. The Resend API key can be set from the admin
 * panel; a stored value overrides the RESEND_API_KEY / MAIL_FROM env vars.
 * The key itself is never returned to clients — only a masked preview.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Effective Resend key: DB value first, then env. Used by MailService. */
  async resendApiKey(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
    return row?.resendApiKey || this.config.get<string>('RESEND_API_KEY') || null;
  }

  async mailFrom(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
    return (
      row?.mailFrom || this.config.get<string>('MAIL_FROM') || 'PressPass <onboarding@resend.dev>'
    );
  }

  /** Uploaded NSZHU logo path (shown on union members' cards), or null. */
  async nszhuLogoPath(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
    return row?.nszhuLogoPath ?? null;
  }

  /** Sets (or clears with null) the NSZHU logo path after an upload/delete. */
  async setNszhuLogo(path: string | null): Promise<AppSettings> {
    await this.prisma.appSetting.upsert({
      where: { id: SINGLETON_ID },
      update: { nszhuLogoPath: path },
      create: { id: SINGLETON_ID, nszhuLogoPath: path },
    });
    return this.getPublic();
  }

  /** Public view for the admin panel (secret masked). */
  async getPublic(): Promise<AppSettings> {
    const key = await this.resendApiKey();
    return {
      resendConfigured: Boolean(key),
      resendKeyPreview: key ? mask(key) : null,
      mailFrom: await this.mailFrom(),
      nszhuLogoPath: await this.nszhuLogoPath(),
    };
  }

  async update(input: UpdateSettingsInput): Promise<AppSettings> {
    const data: { resendApiKey?: string | null; mailFrom?: string } = {};
    if (input.resendApiKey !== undefined) {
      // Empty string clears the stored key (falls back to env).
      data.resendApiKey = input.resendApiKey.trim() || null;
    }
    if (input.mailFrom !== undefined) {
      data.mailFrom = input.mailFrom.trim();
    }
    await this.prisma.appSetting.upsert({
      where: { id: SINGLETON_ID },
      update: data,
      create: { id: SINGLETON_ID, ...data },
    });
    return this.getPublic();
  }
}

/** Masks a secret, keeping only a short prefix and suffix. */
function mask(secret: string): string {
  if (secret.length <= 8) {
    return '••••';
  }
  return `${secret.slice(0, 3)}…${secret.slice(-4)}`;
}
