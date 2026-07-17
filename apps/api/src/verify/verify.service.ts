import { Injectable, NotFoundException } from '@nestjs/common';
import { effectiveCardStatus, type VerifyResponse } from '@presspass/shared';

import { toIsoDate } from '../common/card.mapper';
import { mapCardEditorial } from '../common/editorial.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrToken: QrTokenService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Публічна перевірка посвідчення за QR-кодом.
   *
   * Дані повертаються ЛИШЕ за дійсного короткоживучого токена з QR:
   * прострочений/відсутній/чужий токен → valid:false без персональних даних.
   * Це блокує підробки через скриншот QR і перебір UUID.
   */
  async verify(uuid: string, token?: string): Promise<VerifyResponse> {
    const qrStatus = await this.qrToken.check(token, uuid);
    if (qrStatus !== 'VALID') {
      return { valid: false, qrStatus };
    }

    const card = await this.prisma.card.findUnique({
      where: { uuid },
      include: { journalist: true, editorial: true },
    });
    if (!card) {
      throw new NotFoundException('Card not found');
    }

    const status = effectiveCardStatus(card.status, card.expireDate);
    const nszhuMember = card.journalist.nszhuMember;
    return {
      valid: status === 'ACTIVE',
      qrStatus: 'VALID',
      status,
      cardNumber: card.cardNumber,
      expireDate: toIsoDate(card.expireDate),
      fullName: card.journalist.fullName,
      fullNameEn: card.journalist.fullNameEn,
      // Посаду беремо з посвідчення (її задає редакція при видачі).
      position: card.position,
      // Назву редакції-емітента — дисплей-назву з реєстру компаній.
      organization: card.editorial?.displayNameUk || card.editorial?.name || '',
      photoPath: card.journalist.photoPath,
      editorial: mapCardEditorial(card.editorial),
      nszhuMember,
      // Логотип НСЖУ показуємо лише членам спілки.
      nszhuLogoPath: nszhuMember ? await this.settings.nszhuLogoPath() : null,
    };
  }
}
