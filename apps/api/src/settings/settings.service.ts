import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppSettings, UpdateSettingsInput } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PublicMediaCacheService } from '../crypto/public-media-cache.service';
import { QrTokenService, QR_TTL_MIN, QR_TTL_MAX } from '../qr/qr-token.service';
const SINGLETON_ID = 1;
interface SecretSettings {
  resendApiKey: string | null;
  mailFrom: string;
  nszhuLogoPath: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
}
@Injectable()
export class SettingsService {
  private runtime: SecretSettings | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
    private readonly files: EncryptedFileService,
    private readonly publicMedia: PublicMediaCacheService,
    private readonly qrToken: QrTokenService,
  ) {}
  async resendApiKey(): Promise<string | null> {
    return this.runtime?.resendApiKey || this.config.get<string>('RESEND_API_KEY') || null;
  }
  async mailFrom(): Promise<string> {
    return (
      this.runtime?.mailFrom ||
      this.config.get<string>('MAIL_FROM') ||
      'PressPass <onboarding@resend.dev>'
    );
  }
  // The NSZHU logo is public (printed on credentials, shown on /verify), so it is
  // served from the plaintext data-URI column — durable across restarts and
  // readable without an unlock, unlike the volatile encrypted projection.
  async nszhuLogoPath(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
    return row?.nszhuLogoData ?? null;
  }

  /** Configured QR validity in seconds (also the client refresh interval). */
  async qrTtlSeconds(): Promise<number> {
    return this.qrToken.ttlSeconds;
  }

  // Google OAuth secrets: served from the in-memory runtime cache (warmed when an
  // admin loads settings) with the environment as the durable fallback. After a
  // restart, panel-only values apply again once an admin opens settings.
  googleClientId(): string {
    return this.runtime?.googleClientId || this.config.get<string>('GOOGLE_CLIENT_ID') || '';
  }
  googleClientSecret(): string {
    return (
      this.runtime?.googleClientSecret || this.config.get<string>('GOOGLE_CLIENT_SECRET') || ''
    );
  }
  googleEnabled(): boolean {
    return Boolean(this.googleClientId() && this.googleClientSecret());
  }

  async getPublic(userId?: number, token?: string): Promise<AppSettings> {
    if (userId && token) await this.load(userId, token);
    const key = await this.resendApiKey();
    const googleSecret = this.googleClientSecret();
    return {
      resendConfigured: Boolean(key),
      resendKeyPreview: key ? mask(key) : null,
      mailFrom: await this.mailFrom(),
      nszhuLogoPath: await this.nszhuLogoPath(),
      googleConfigured: this.googleEnabled(),
      googleClientId: this.googleClientId() || null,
      googleSecretPreview: googleSecret ? mask(googleSecret) : null,
      qrTtlSeconds: this.qrToken.ttlSeconds,
    };
  }
  async update(input: UpdateSettingsInput, userId: number, token?: string): Promise<AppSettings> {
    const key = this.key(userId, token);
    const current = await this.readRow(key);
    const next: SecretSettings = {
      ...current,
      ...(input.resendApiKey !== undefined
        ? { resendApiKey: input.resendApiKey.trim() || null }
        : {}),
      ...(input.mailFrom !== undefined ? { mailFrom: input.mailFrom.trim() } : {}),
      ...(input.googleClientId !== undefined
        ? { googleClientId: input.googleClientId.trim() || null }
        : {}),
      ...(input.googleClientSecret !== undefined
        ? { googleClientSecret: input.googleClientSecret.trim() || null }
        : {}),
    };
    try {
      await this.save(next, key);
      this.runtime = next;
    } finally {
      key.fill(0);
    }
    // QR TTL is a public, non-secret integer — store it plaintext and apply it
    // to the live cache immediately so validity/refresh update without a restart.
    if (input.qrTtlSeconds !== undefined) {
      const ttl = Math.min(QR_TTL_MAX, Math.max(QR_TTL_MIN, Math.round(input.qrTtlSeconds)));
      await this.prisma.appSetting.upsert({
        where: { id: SINGLETON_ID },
        update: { qrTtlSeconds: ttl },
        create: { id: SINGLETON_ID, qrTtlSeconds: ttl },
      });
      this.qrToken.setTtlSeconds(ttl);
    }
    return this.getPublic();
  }
  async setNszhuLogo(
    bytes: Buffer | null,
    mimeType: string | null,
    userId: number,
    token?: string,
  ): Promise<AppSettings> {
    const key = this.key(userId, token);
    const current = await this.readRow(key);
    try {
      let path: string | null = null;
      if (bytes && mimeType) {
        const id = await this.files.store({
          ownerType: 'system',
          ownerId: '1',
          purpose: 'nszhu-logo',
          mimeType,
          bytes,
          ownerKey: key,
        });
        path = `/media/${id}`;
      }
      const next = { ...current, nszhuLogoPath: path };
      await this.save(next, key);
      this.runtime = await this.project(next, key);
      // Also store a public, plaintext data URI so the logo renders on the card
      // and the public /verify page without a key and across restarts.
      const dataUri =
        bytes && mimeType ? `data:${mimeType};base64,${bytes.toString('base64')}` : null;
      await this.prisma.appSetting.upsert({
        where: { id: SINGLETON_ID },
        update: { nszhuLogoData: dataUri },
        create: { id: SINGLETON_ID, nszhuLogoData: dataUri },
      });
      if (path)
        await this.files.cleanupReplaced('system', '1', 'nszhu-logo', path.slice('/media/'.length));
    } finally {
      key.fill(0);
    }
    return this.getPublic();
  }
  private async load(userId: number, token: string): Promise<void> {
    const key = this.key(userId, token);
    try {
      this.runtime = await this.project(await this.readRow(key), key);
    } finally {
      key.fill(0);
    }
  }
  private async project(settings: SecretSettings, key: Buffer): Promise<SecretSettings> {
    const fileId = settings.nszhuLogoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
    if (!fileId) return settings;
    const file = await this.files.read(fileId, key);
    return {
      ...settings,
      nszhuLogoPath: `/public-media/${this.publicMedia.put(file.bytes, file.mimeType, 3600)}`,
    };
  }
  private async readRow(key: Buffer): Promise<SecretSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { id: SINGLETON_ID } });
    if (row?.encryptedData)
      return this.payloads.decrypt('settings', 1, 'system:1', row.encryptedData, key);
    return {
      resendApiKey: null,
      mailFrom: this.config.get('MAIL_FROM', 'PressPass <onboarding@resend.dev>'),
      nszhuLogoPath: null,
      googleClientId: null,
      googleClientSecret: null,
    };
  }
  private async save(data: SecretSettings, key: Buffer): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { id: 1 },
      update: {
        encryptedData: this.payloads.encrypt('settings', 1, 'system:1', data, key),
      },
      create: { id: 1, encryptedData: this.payloads.encrypt('settings', 1, 'system:1', data, key) },
    });
  }
  private key(userId: number, token?: string): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.sessions.key(token, userId, 'system');
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
}
function mask(secret: string): string {
  return secret.length <= 8 ? '••••' : `${secret.slice(0, 3)}…${secret.slice(-4)}`;
}
