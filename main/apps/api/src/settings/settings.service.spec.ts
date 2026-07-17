import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;

  const prismaMock = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const configMock = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  it('prefers the DB key over the env var', async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({ resendApiKey: 're_dbkey1234567890' });
    configMock.get.mockReturnValue('re_envkey');

    expect(await service.resendApiKey()).toBe('re_dbkey1234567890');
  });

  it('falls back to the env var when the DB has no key', async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({ resendApiKey: null });
    configMock.get.mockImplementation((k: string) =>
      k === 'RESEND_API_KEY' ? 're_envkey' : undefined,
    );

    expect(await service.resendApiKey()).toBe('re_envkey');
  });

  it('never returns the raw key — only a masked preview', async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue({ resendApiKey: 're_secret_abcdef1234' });
    configMock.get.mockReturnValue(undefined);

    const pub = await service.getPublic();

    expect(pub.resendConfigured).toBe(true);
    expect(pub.resendKeyPreview).not.toContain('secret');
    expect(pub.resendKeyPreview).toMatch(/…/);
    // The preview keeps only a short prefix + suffix.
    expect(pub.resendKeyPreview).toBe('re_…1234');
  });

  it('reports not configured when neither DB nor env has a key', async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue(null);
    configMock.get.mockReturnValue(undefined);

    const pub = await service.getPublic();

    expect(pub.resendConfigured).toBe(false);
    expect(pub.resendKeyPreview).toBeNull();
  });

  it('clearing the key stores null (empty string → fall back to env)', async () => {
    prismaMock.appSetting.findUnique.mockResolvedValue(null);
    configMock.get.mockReturnValue(undefined);
    prismaMock.appSetting.upsert.mockResolvedValue({});

    await service.update({ resendApiKey: '' });

    expect(prismaMock.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { resendApiKey: null } }),
    );
  });
});
