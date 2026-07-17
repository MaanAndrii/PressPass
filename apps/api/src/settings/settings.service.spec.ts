import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';
describe('SettingsService encrypted storage', () => {
  const prisma: any = { appSetting: { findUnique: jest.fn(), upsert: jest.fn() } };
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 1)) };
  const payloads: any = {
    encrypt: jest.fn(() => ({ version: 1, envelope: { ciphertext: 'opaque' } })),
    decrypt: jest.fn(),
  };
  const files: any = { store: jest.fn(), read: jest.fn(), cleanupReplaced: jest.fn() };
  const media: any = { put: jest.fn() };
  let service: SettingsService;
  const create = () =>
    new SettingsService(
      prisma,
      new ConfigService({ MAIL_FROM: 'env@example.com' }),
      sessions,
      payloads,
      files,
      media,
    );
  beforeEach(() => {
    jest.clearAllMocks();
    service = create();
  });
  it('stores secrets only inside the encrypted payload and clears legacy columns', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    prisma.appSetting.upsert.mockResolvedValue({});
    await service.update({ resendApiKey: 're_secret', mailFrom: 'Sender <x@y.z>' }, 1, 'unlock');
    expect(payloads.encrypt).toHaveBeenCalledWith(
      'settings',
      1,
      'system:1',
      expect.objectContaining({ resendApiKey: 're_secret' }),
      expect.any(Buffer),
    );
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          resendApiKey: null,
          mailFrom: null,
          nszhuLogoPath: null,
        }),
      }),
    );
  });
  it('does not expose the configured secret in the public response', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ encryptedData: {} });
    payloads.decrypt.mockReturnValue({
      resendApiKey: 're_verysecret',
      mailFrom: 'Sender',
      nszhuLogoPath: null,
    });
    const result = await service.getPublic(1, 'unlock');
    expect(result.resendConfigured).toBe(true);
    expect(result.resendKeyPreview).not.toContain('verysecret');
  });
  it('falls back to environment mail settings while the system key is locked', async () => {
    await expect(service.mailFrom()).resolves.toBe('env@example.com');
  });
});
