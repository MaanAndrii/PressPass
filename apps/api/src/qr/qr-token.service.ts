import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerifyResponse } from '@presspass/shared';

/** The verify projection a QR resolves to (everything but the live status). */
export type QrProjection = Omit<VerifyResponse, 'valid' | 'qrStatus' | 'status'>;

/** Configuration for the short-lived QR projection (its time-to-live). */
@Injectable()
export class QrTokenService {
  constructor(private readonly config: ConfigService) {}

  get ttlSeconds(): number {
    return Number(this.config.get('QR_TOKEN_TTL', 60));
  }
}
