import { Injectable } from '@nestjs/common';
import type { EncryptedEnvelopeV1, EncryptionContext } from './crypto.types';
import { DataEncryptionService } from './data-encryption.service';

export interface ProtectedPayloadV1 {
  version: 1;
  envelope: EncryptedEnvelopeV1;
}

@Injectable()
export class ProtectedDataService {
  constructor(private readonly crypto: DataEncryptionService) {}

  encrypt<T extends object>(value: T, key: Buffer, context: EncryptionContext): ProtectedPayloadV1 {
    return { version: 1, envelope: this.crypto.encrypt(JSON.stringify(value), key, context) };
  }

  decrypt<T>(value: unknown, key: Buffer, context: EncryptionContext): T {
    if (!this.isPayload(value)) throw new Error('Unsupported protected payload');
    const decoded = this.crypto.decrypt(value.envelope, key, context).toString('utf8');
    try {
      return JSON.parse(decoded) as T;
    } catch {
      throw new Error('Protected payload is not valid JSON');
    }
  }

  private isPayload(value: unknown): value is ProtectedPayloadV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Partial<ProtectedPayloadV1>;
    return (
      candidate.version === 1 &&
      typeof candidate.envelope === 'object' &&
      candidate.envelope !== null
    );
  }
}
