import { DataEncryptionService } from './data-encryption.service';
import { UserKeyMaterialService } from './user-key-material.service';
import { ConfigService } from '@nestjs/config';

describe('UserKeyMaterialService', () => {
  let service: UserKeyMaterialService;

  beforeEach(() => {
    service = new UserKeyMaterialService(
      new DataEncryptionService(),
      new ConfigService({ DATA_KEY_SECRET: 'test-secret-that-is-at-least-32-bytes-long' }),
    );
  });

  it('provisions material that the same user and password can unlock', async () => {
    const material = await service.provision(17, 'correct horse battery staple');
    const dataKey = await service.unlock(
      17,
      'correct horse battery staple',
      material.passwordKdf,
      material.dataKeyEnvelope,
    );

    expect(dataKey).toHaveLength(32);
    expect(material.passwordKdf).toMatchObject({ version: 1, algorithm: 'ARGON2ID' });
    expect(material.dataKeyEnvelope).toMatchObject({ version: 1, algorithm: 'AES-256-GCM' });
    dataKey.fill(0);
  });

  it('binds key material to the user id', async () => {
    const material = await service.provision(17, 'correct horse battery staple');

    await expect(
      service.unlock(
        18,
        'correct horse battery staple',
        material.passwordKdf,
        material.dataKeyEnvelope,
      ),
    ).rejects.toThrow('Decryption failed');
  });

  it('rewraps the same data key for a new password', async () => {
    const original = await service.provision(17, 'old-password');
    const originalDataKey = await service.unlock(
      17,
      'old-password',
      original.passwordKdf,
      original.dataKeyEnvelope,
    );

    const rewrapped = await service.rewrap(
      17,
      'old-password',
      'new-password',
      original.passwordKdf,
      original.dataKeyEnvelope,
    );
    const rewrappedDataKey = await service.unlock(
      17,
      'new-password',
      rewrapped.passwordKdf,
      rewrapped.dataKeyEnvelope,
    );

    expect(rewrappedDataKey).toEqual(originalDataKey);
    expect(rewrapped.passwordKdf).not.toEqual(original.passwordKdf);
    await expect(
      service.unlock(17, 'old-password', rewrapped.passwordKdf, rewrapped.dataKeyEnvelope),
    ).rejects.toThrow('Decryption failed');
    originalDataKey.fill(0);
    rewrappedDataKey.fill(0);
  });

  it('recovers the same data key for an administrative password reset', async () => {
    const original = await service.provision(17, 'old-password');
    const before = await service.unlock(
      17,
      'old-password',
      original.passwordKdf,
      original.dataKeyEnvelope,
    );

    const reset = await service.resetWithRecovery(
      17,
      'replacement-password',
      original.recoveryKeyEnvelope,
    );
    const after = await service.unlock(
      17,
      'replacement-password',
      reset.passwordKdf,
      reset.dataKeyEnvelope,
    );

    expect(after).toEqual(before);
    expect(reset.recoveryKeyEnvelope).toEqual(original.recoveryKeyEnvelope);
    before.fill(0);
    after.fill(0);
  });

  it('rejects malformed persisted JSON', async () => {
    await expect(service.unlock(17, 'password', null, {})).rejects.toThrow(
      'Invalid password KDF descriptor',
    );
    await expect(service.unlock(17, 'password', {}, [])).rejects.toThrow(
      'Invalid data key envelope',
    );
  });
});
