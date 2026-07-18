import { Injectable, NotFoundException } from '@nestjs/common';
import { effectiveCardStatus, type VerifyResponse } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QrProjectionCacheService } from '../qr/qr-projection-cache.service';

@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrProjections: QrProjectionCacheService,
  ) {}
  async verify(uuid: string, token?: string): Promise<VerifyResponse> {
    const projection = this.qrProjections.get(token, uuid);
    if (!projection) {
      // The id is unknown/expired (QR codes are short-lived) or none was given.
      return { valid: false, qrStatus: token ? 'EXPIRED' : 'MISSING' };
    }
    const card = await this.prisma.card.findUnique({ where: { uuid }, select: { status: true } });
    if (!card) throw new NotFoundException('Card not found');
    if (!projection.expireDate) return { valid: false, qrStatus: 'INVALID' };
    const status = effectiveCardStatus(card.status, projection.expireDate);
    return { ...projection, valid: status === 'ACTIVE', qrStatus: 'VALID', status };
  }
}
