import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { QrTokenStatus } from '@presspass/shared';

interface QrTokenPayload {
  purpose: string;
  card: string;
}

/**
 * Захист QR-кодів від підробки (динамічний QR).
 *
 * QR містить не «вічне» посилання, а URL з коротко­живучим підписаним
 * токеном (HMAC-JWT з `exp`). Токен генерується тільки сервером, діє
 * QR_TOKEN_TTL секунд (типово 60) і привʼязаний до конкретного UUID
 * посвідчення. Застосунок оновлює QR кожні ~30 секунд, тому скриншот або
 * роздрук чужого QR перестає проходити перевірку майже одразу. Без
 * дійсного токена сторінка перевірки не розкриває жодних даних — підбір
 * UUID нічого не дає. Стан ніде не зберігається (перевірка — підпис + exp),
 * що відповідає варіанту «HMAC/JWT із полем exp» без журналу токенів.
 */
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

  /** Signs a fresh token for the given card UUID. */
  async sign(cardUuid: string): Promise<string> {
    return this.jwtService.signAsync(
      { purpose: QrTokenService.PURPOSE, card: cardUuid },
      { expiresIn: `${this.ttlSeconds}s` },
    );
  }

  /** Validates a token against the card UUID from the URL. */
  async check(token: string | undefined, cardUuid: string): Promise<QrTokenStatus> {
    if (!token) {
      return 'MISSING';
    }
    try {
      const payload = await this.jwtService.verifyAsync<QrTokenPayload>(token);
      return payload.purpose === QrTokenService.PURPOSE && payload.card === cardUuid
        ? 'VALID'
        : 'INVALID';
    } catch (error) {
      return error instanceof Error && error.name === 'TokenExpiredError' ? 'EXPIRED' : 'INVALID';
    }
  }
}
