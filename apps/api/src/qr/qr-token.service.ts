import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { QrTokenStatus, VerifyResponse } from '@presspass/shared';
export type QrProjection = Omit<VerifyResponse, 'valid' | 'qrStatus' | 'status'>;
interface QrTokenPayload {
  purpose: string;
  card: string;
  projection?: QrProjection;
}
@Injectable()
export class QrTokenService {
  private static readonly PURPOSE = 'card-verify';
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}
  get ttlSeconds(): number {
    return Number(this.config.get('QR_TOKEN_TTL', 60));
  }
  async sign(cardUuid: string, projection?: QrProjection): Promise<string> {
    return this.jwtService.signAsync(
      { purpose: QrTokenService.PURPOSE, card: cardUuid, projection },
      { expiresIn: `${this.ttlSeconds}s` },
    );
  }
  async inspect(
    token: string | undefined,
    cardUuid: string,
  ): Promise<{ status: QrTokenStatus; projection?: QrProjection }> {
    if (!token) return { status: 'MISSING' };
    try {
      const payload = await this.jwtService.verifyAsync<QrTokenPayload>(token);
      return payload.purpose === QrTokenService.PURPOSE && payload.card === cardUuid
        ? { status: 'VALID', projection: payload.projection }
        : { status: 'INVALID' };
    } catch (error) {
      return {
        status:
          error instanceof Error && error.name === 'TokenExpiredError' ? 'EXPIRED' : 'INVALID',
      };
    }
  }
  async check(token: string | undefined, cardUuid: string): Promise<QrTokenStatus> {
    return (await this.inspect(token, cardUuid)).status;
  }
}
