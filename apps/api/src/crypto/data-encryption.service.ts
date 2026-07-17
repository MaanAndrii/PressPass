import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import {
  DATA_KEY_BYTES,
  type Argon2idDescriptorV1,
  type DerivedWrappingKey,
  type EncryptedEnvelopeV1,
  type EncryptionContext,
  GCM_NONCE_BYTES,
  GCM_TAG_BYTES,
} from './crypto.types';

const DEFAULT_KDF_PARAMETERS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const MINIMUM_KDF_PARAMETERS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const MAXIMUM_KDF_PARAMETERS = {
  memoryCost: 262_144,
  timeCost: 10,
  parallelism: 16,
} as const;

/**
 * Versioned application-level encryption primitives.
 *
 * Business data is encrypted with a random data key. Password-derived keys
 * only wrap data keys, which makes password changes a small atomic rewrap
 * operation instead of requiring every encrypted value to be rewritten.
 */
@Injectable()
export class DataEncryptionService {
  generateDataKey(): Buffer {
    return randomBytes(DATA_KEY_BYTES);
  }

  encrypt(
    plaintext: Buffer | string,
    key: Buffer,
    context: EncryptionContext,
  ): EncryptedEnvelopeV1 {
    this.assertKey(key);
    const nonce = randomBytes(GCM_NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: GCM_TAG_BYTES });
    cipher.setAAD(this.contextBytes(context));
    const ciphertext = Buffer.concat([
      cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext),
      cipher.final(),
    ]);

    return {
      version: 1,
      algorithm: 'AES-256-GCM',
      nonce: nonce.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(envelope: EncryptedEnvelopeV1, key: Buffer, context: EncryptionContext): Buffer {
    this.assertKey(key);
    this.assertEnvelope(envelope);

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        this.decode(envelope.nonce, GCM_NONCE_BYTES),
        { authTagLength: GCM_TAG_BYTES },
      );
      decipher.setAAD(this.contextBytes(context));
      decipher.setAuthTag(this.decode(envelope.authTag, GCM_TAG_BYTES));
      return Buffer.concat([decipher.update(this.decode(envelope.ciphertext)), decipher.final()]);
    } catch {
      // Do not reveal whether the key, context, tag, or ciphertext was wrong.
      throw new Error('Decryption failed');
    }
  }

  wrapKey(dataKey: Buffer, wrappingKey: Buffer, context: EncryptionContext): EncryptedEnvelopeV1 {
    this.assertKey(dataKey);
    return this.encrypt(dataKey, wrappingKey, context);
  }

  unwrapKey(
    envelope: EncryptedEnvelopeV1,
    wrappingKey: Buffer,
    context: EncryptionContext,
  ): Buffer {
    const dataKey = this.decrypt(envelope, wrappingKey, context);
    this.assertKey(dataKey);
    return dataKey;
  }

  rewrapKey(
    envelope: EncryptedEnvelopeV1,
    oldWrappingKey: Buffer,
    newWrappingKey: Buffer,
    context: EncryptionContext,
  ): EncryptedEnvelopeV1 {
    const dataKey = this.unwrapKey(envelope, oldWrappingKey, context);
    try {
      return this.wrapKey(dataKey, newWrappingKey, context);
    } finally {
      dataKey.fill(0);
    }
  }

  async createPasswordWrappingKey(password: string): Promise<DerivedWrappingKey> {
    if (!password) {
      throw new Error('Password must not be empty');
    }
    const descriptor: Argon2idDescriptorV1 = {
      version: 1,
      algorithm: 'ARGON2ID',
      salt: randomBytes(16).toString('base64url'),
      ...DEFAULT_KDF_PARAMETERS,
      hashLength: DATA_KEY_BYTES,
    };
    return { key: await this.derivePasswordWrappingKey(password, descriptor), descriptor };
  }

  async derivePasswordWrappingKey(
    password: string,
    descriptor: Argon2idDescriptorV1,
  ): Promise<Buffer> {
    if (!password) {
      throw new Error('Password must not be empty');
    }
    this.assertKdfDescriptor(descriptor);
    return argon2.hash(password, {
      type: argon2.argon2id,
      salt: this.decode(descriptor.salt, 16),
      memoryCost: descriptor.memoryCost,
      timeCost: descriptor.timeCost,
      parallelism: descriptor.parallelism,
      hashLength: descriptor.hashLength,
      raw: true,
    });
  }

  private contextBytes(context: EncryptionContext): Buffer {
    const requiredValues = {
      entity: context.entity,
      entityId: context.entityId,
      field: context.field,
    };
    for (const [name, value] of Object.entries(requiredValues)) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Encryption context ${name} must be a non-empty string`);
      }
    }
    if (context.ownerId !== undefined && context.ownerId.length === 0) {
      throw new Error('Encryption context ownerId must be a non-empty string');
    }
    return Buffer.from(
      JSON.stringify({
        entity: context.entity,
        entityId: context.entityId,
        field: context.field,
        ownerId: context.ownerId ?? '',
      }),
      'utf8',
    );
  }

  private assertKey(key: Buffer): void {
    if (!Buffer.isBuffer(key) || key.length !== DATA_KEY_BYTES) {
      throw new Error('Encryption keys must be 32-byte buffers');
    }
  }

  private assertEnvelope(envelope: EncryptedEnvelopeV1): void {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
      throw new Error('Unsupported encrypted envelope');
    }
  }

  private assertKdfDescriptor(descriptor: Argon2idDescriptorV1): void {
    if (
      descriptor.version !== 1 ||
      descriptor.algorithm !== 'ARGON2ID' ||
      descriptor.hashLength !== DATA_KEY_BYTES ||
      descriptor.memoryCost < MINIMUM_KDF_PARAMETERS.memoryCost ||
      descriptor.memoryCost > MAXIMUM_KDF_PARAMETERS.memoryCost ||
      descriptor.timeCost < MINIMUM_KDF_PARAMETERS.timeCost ||
      descriptor.timeCost > MAXIMUM_KDF_PARAMETERS.timeCost ||
      descriptor.parallelism < MINIMUM_KDF_PARAMETERS.parallelism ||
      descriptor.parallelism > MAXIMUM_KDF_PARAMETERS.parallelism
    ) {
      throw new Error('Unsupported or unsafe password KDF parameters');
    }
    this.decode(descriptor.salt, 16);
  }

  private decode(value: string, expectedLength?: number): Buffer {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) {
      throw new Error('Invalid base64url value');
    }
    const decoded = Buffer.from(value, 'base64url');
    if (expectedLength !== undefined && decoded.length !== expectedLength) {
      throw new Error('Invalid encoded value length');
    }
    return decoded;
  }
}
