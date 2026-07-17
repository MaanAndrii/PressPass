import { randomBytes } from 'crypto';

import type { EncryptedEnvelopeV1, EncryptionContext } from './crypto.types';
import { DataEncryptionService } from './data-encryption.service';

describe('DataEncryptionService', () => {
  const context: EncryptionContext = {
    entity: 'journalist',
    entityId: '42',
    field: 'profile',
    ownerId: 'user:17',
  };
  let service: DataEncryptionService;

  beforeEach(() => {
    service = new DataEncryptionService();
  });

  it('generates independent 256-bit data keys', () => {
    const first = service.generateDataKey();
    const second = service.generateDataKey();

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first.equals(second)).toBe(false);
  });

  it('round-trips UTF-8 text in a versioned AES-256-GCM envelope', () => {
    const key = service.generateDataKey();
    const envelope = service.encrypt('Андрій — PressPass', key, context);

    expect(envelope).toMatchObject({ version: 1, algorithm: 'AES-256-GCM' });
    expect(Buffer.from(envelope.nonce, 'base64url')).toHaveLength(12);
    expect(Buffer.from(envelope.authTag, 'base64url')).toHaveLength(16);
    expect(service.decrypt(envelope, key, context).toString('utf8')).toBe('Андрій — PressPass');
  });

  it('round-trips arbitrary binary data', () => {
    const key = service.generateDataKey();
    const plaintext = randomBytes(257);

    expect(service.decrypt(service.encrypt(plaintext, key, context), key, context)).toEqual(
      plaintext,
    );
  });

  it('uses a fresh nonce for every encryption', () => {
    const key = service.generateDataKey();
    const nonces = new Set(
      Array.from({ length: 100 }, () => service.encrypt('same value', key, context).nonce),
    );

    expect(nonces).toHaveProperty('size', 100);
  });

  it('rejects a wrong key without disclosing the failure cause', () => {
    const envelope = service.encrypt('secret', service.generateDataKey(), context);

    expect(() => service.decrypt(envelope, service.generateDataKey(), context)).toThrow(
      'Decryption failed',
    );
  });

  it('binds ciphertext to its complete authenticated context', () => {
    const key = service.generateDataKey();
    const envelope = service.encrypt('secret', key, context);

    expect(() =>
      service.decrypt(envelope, key, { ...context, entityId: 'another-journalist' }),
    ).toThrow('Decryption failed');
    expect(() => service.decrypt(envelope, key, { ...context, field: 'taxNumber' })).toThrow(
      'Decryption failed',
    );
  });

  it.each(['ciphertext', 'authTag'] as const)('detects tampered %s', (property) => {
    const key = service.generateDataKey();
    const envelope = service.encrypt('secret', key, context);
    const bytes = Buffer.from(envelope[property], 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    const tampered = { ...envelope, [property]: bytes.toString('base64url') };

    expect(() => service.decrypt(tampered, key, context)).toThrow('Decryption failed');
  });

  it('rejects unsupported envelope versions', () => {
    const key = service.generateDataKey();
    const envelope = service.encrypt('secret', key, context);
    const unsupported = { ...envelope, version: 2 } as unknown as EncryptedEnvelopeV1;

    expect(() => service.decrypt(unsupported, key, context)).toThrow(
      'Unsupported encrypted envelope',
    );
  });

  it('wraps and unwraps data keys', () => {
    const dataKey = service.generateDataKey();
    const wrappingKey = service.generateDataKey();
    const envelope = service.wrapKey(dataKey, wrappingKey, {
      ...context,
      field: 'data-key:user',
    });

    expect(
      service.unwrapKey(envelope, wrappingKey, { ...context, field: 'data-key:user' }),
    ).toEqual(dataKey);
  });

  it('rewraps a data key without changing the data key', () => {
    const dataKey = service.generateDataKey();
    const oldWrappingKey = service.generateDataKey();
    const newWrappingKey = service.generateDataKey();
    const keyContext = { ...context, field: 'data-key:user' };
    const oldEnvelope = service.wrapKey(dataKey, oldWrappingKey, keyContext);

    const newEnvelope = service.rewrapKey(oldEnvelope, oldWrappingKey, newWrappingKey, keyContext);

    expect(service.unwrapKey(newEnvelope, newWrappingKey, keyContext)).toEqual(dataKey);
    expect(() => service.unwrapKey(newEnvelope, oldWrappingKey, keyContext)).toThrow(
      'Decryption failed',
    );
  });

  it('derives the same wrapping key from the password and stored descriptor', async () => {
    const created = await service.createPasswordWrappingKey('correct horse battery staple');
    const restored = await service.derivePasswordWrappingKey(
      'correct horse battery staple',
      created.descriptor,
    );

    expect(created.key).toHaveLength(32);
    expect(restored).toEqual(created.key);
    expect(created.descriptor).toMatchObject({
      version: 1,
      algorithm: 'ARGON2ID',
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
    expect(Buffer.from(created.descriptor.salt, 'base64url')).toHaveLength(16);
  });

  it('derives different wrapping keys for different salts and passwords', async () => {
    const first = await service.createPasswordWrappingKey('same password');
    const second = await service.createPasswordWrappingKey('same password');
    const wrongPassword = await service.derivePasswordWrappingKey(
      'different password',
      first.descriptor,
    );

    expect(second.descriptor.salt).not.toBe(first.descriptor.salt);
    expect(second.key.equals(first.key)).toBe(false);
    expect(wrongPassword.equals(first.key)).toBe(false);
  });

  it('rejects empty passwords and unsafe persisted KDF parameters', async () => {
    await expect(service.createPasswordWrappingKey('')).rejects.toThrow(
      'Password must not be empty',
    );
    const created = await service.createPasswordWrappingKey('strong password');

    await expect(
      service.derivePasswordWrappingKey('strong password', {
        ...created.descriptor,
        memoryCost: 1024,
      }),
    ).rejects.toThrow('Unsupported or unsafe password KDF parameters');

    await expect(
      service.derivePasswordWrappingKey('strong password', {
        ...created.descriptor,
        memoryCost: 1_000_000,
      }),
    ).rejects.toThrow('Unsupported or unsafe password KDF parameters');
  });

  it('rejects malformed keys and encryption contexts', () => {
    expect(() => service.encrypt('secret', randomBytes(16), context)).toThrow(
      'Encryption keys must be 32-byte buffers',
    );
    expect(() =>
      service.encrypt('secret', service.generateDataKey(), { ...context, field: '' }),
    ).toThrow('Encryption context field must be a non-empty string');
    expect(() =>
      service.encrypt('secret', service.generateDataKey(), { ...context, ownerId: '' }),
    ).toThrow('Encryption context ownerId must be a non-empty string');
  });
});
