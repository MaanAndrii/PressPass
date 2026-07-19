import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerifyResponse } from '@presspass/shared';

import { PrismaService } from '../prisma/prisma.service';

/** The verify projection a QR resolves to (everything but the live status). */
export type QrProjection = Omit<VerifyResponse, 'valid' | 'qrStatus' | 'status'>;

/** Allowed range for the configurable QR validity (seconds). */
export const QR_TTL_MIN = 10;
export const QR_TTL_MAX = 300;

/**
 * Configuration for the short-lived QR projection (its time-to-live). The value
 * is admin-configurable (AppSetting.qrTtlSeconds) and also drives the client's
 * refresh interval via `expiresInSeconds`, so validity and regeneration
 * coincide. Cached in memory and refreshed on boot and whenever an admin saves.
 */
@Injectable()
export class QrTokenService implements OnModuleInit {
  private cached: number | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Reloads the configured TTL from the database (best-effort). */
  async refresh(): Promise<void> {
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { id: 1 } });
      this.cached = row?.qrTtlSeconds ?? null;
    } catch {
      // Leave the cache as-is; the getter falls back to env/default.
    }
  }

  /** Updates the in-memory value immediately after an admin change. */
  setTtlSeconds(value: number | null): void {
    this.cached = value;
  }

  get ttlSeconds(): number {
    return this.cached ?? Number(this.config.get('QR_TOKEN_TTL', 60));
  }
}
