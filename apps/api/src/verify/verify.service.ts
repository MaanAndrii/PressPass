import { Injectable, NotFoundException } from '@nestjs/common';
import { effectiveCardStatus, type VerifyResponse } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QrProjectionCacheService } from '../qr/qr-projection-cache.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrProjections: QrProjectionCacheService,
    private readonly settings: SettingsService,
  ) {}
  async verify(uuid: string, token?: string): Promise<VerifyResponse> {
    const projection = this.qrProjections.get(token, uuid);
    if (!projection) {
      // The id is unknown/expired (QR codes are short-lived) or none was given.
      return { valid: false, qrStatus: token ? 'EXPIRED' : 'MISSING' };
    }
    const card = await this.prisma.card.findUnique({
      where: { uuid },
      select: { status: true, journalist: { select: { user: { select: { deletedAt: true } } } } },
    });
    if (!card) throw new NotFoundException('Card not found');
    // A credential of a soft-deleted (pending-purge) journalist must not verify.
    if (card.journalist.user.deletedAt) return { valid: false, qrStatus: 'INVALID' };
    if (!projection.expireDate) return { valid: false, qrStatus: 'INVALID' };
    const status = effectiveCardStatus(card.status, projection.expireDate);
    // The NSZHU logo is public branding, resolved here so the projection cache
    // stays small; shown only for union members.
    const nszhuLogoPath = projection.nszhuMember ? await this.settings.nszhuLogoPath() : null;
    return { ...projection, nszhuLogoPath, valid: status === 'ACTIVE', qrStatus: 'VALID', status };
  }
}
