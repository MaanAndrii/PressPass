import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { domainToASCII } from 'url';

@Injectable()
export class BlindIndexService {
  constructor(private readonly config: ConfigService) {}

  normalizeEmail(value: string): string {
    const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const at = normalized.lastIndexOf('@');
    if (at <= 0 || at === normalized.length - 1) throw new Error('Invalid email');
    const domain = domainToASCII(normalized.slice(at + 1).normalize('NFC'));
    if (!domain) throw new Error('Invalid email');
    return `${normalized.slice(0, at)}@${domain}`;
  }

  email(value: string): string {
    return this.index('email', this.normalizeEmail(value));
  }

  value(domain: string, value: string): string {
    return this.index(domain, value.normalize('NFKC').trim());
  }

  verificationCode(userId: number, code: string): string {
    return this.index('email-verification', `${userId}:${code}`);
  }

  private index(domain: string, value: string): string {
    const key = this.config.get<string>('LOOKUP_KEY') ?? '';
    if (Buffer.byteLength(key, 'utf8') < 32)
      throw new Error('LOOKUP_KEY must contain at least 32 bytes');
    return `v1:${createHmac('sha256', key).update(`${domain}\0${value}`, 'utf8').digest('base64url')}`;
  }
}
