import { Injectable, NotFoundException } from '@nestjs/common';
import { effectiveCardStatus, type VerifyResponse } from '@presspass/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrToken: QrTokenService,
  ) {}
  async verify(uuid: string, token?: string): Promise<VerifyResponse> {
    const inspected = await this.qrToken.inspect(token, uuid);
    if (inspected.status !== 'VALID') return { valid: false, qrStatus: inspected.status };
    const card = await this.prisma.card.findUnique({ where: { uuid }, select: { status: true } });
    if (!card) throw new NotFoundException('Card not found');
    const projection = inspected.projection;
    if (!projection?.expireDate) return { valid: false, qrStatus: 'INVALID' };
    const status = effectiveCardStatus(card.status, projection.expireDate);
    return { ...projection, valid: status === 'ACTIVE', qrStatus: 'VALID', status };
  }
}
