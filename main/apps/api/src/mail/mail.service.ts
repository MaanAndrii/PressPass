import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { SettingsService } from '../settings/settings.service';

/**
 * Outgoing email via Resend (https://resend.com).
 *
 * The API key comes from admin settings (DB) or the RESEND_API_KEY env var.
 * Without a key the service runs in dev mode: messages are written to the
 * application log instead of being sent, so registration can be tested
 * without an account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly settings: SettingsService) {}

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const subject = `${code} — код підтвердження PressPass`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1d4ed8">PressPass</h2>
        <p>Ваш код підтвердження реєстрації:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
        <p style="color:#64748b">Код діє 15 хвилин. Якщо ви не реєструвалися на PressPass —
        просто проігноруйте цей лист.</p>
      </div>`;
    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = await this.settings.resendApiKey();
    if (!apiKey) {
      this.logger.warn(`Resend key не задано — лист НЕ надіслано (dev-режим).`);
      this.logger.log(`[DEV MAIL] to=${to} subject="${subject}"`);
      return;
    }

    const from = await this.settings.mailFrom();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend error ${response.status}: ${body}`);
      throw new InternalServerErrorException('Не вдалося надіслати лист. Спробуйте пізніше.');
    }
  }
}
