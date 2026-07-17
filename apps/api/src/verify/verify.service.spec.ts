import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import { SettingsService } from '../settings/settings.service';
import { VerifyService } from './verify.service';

describe('VerifyService', () => {
  let service: VerifyService;

  const prismaMock = {
    card: { findUnique: jest.fn() },
  };
  const qrTokenMock = {
    check: jest.fn(),
  };
  const settingsMock = {
    nszhuLogoPath: jest.fn().mockResolvedValue('/uploads/branding/nszhu.png'),
  };

  const journalist = {
    id: 1,
    userId: 2,
    fullName: 'Іван Петренко',
    position: 'Кореспондент',
    organization: 'Редакція «Приклад»',
    photoPath: '/uploads/photos/abc.jpg',
    nszhuMember: false,
  };

  const futureDate = () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    qrTokenMock.check.mockResolvedValue('VALID');
    const moduleRef = await Test.createTestingModule({
      providers: [
        VerifyService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: QrTokenService, useValue: qrTokenMock },
        { provide: SettingsService, useValue: settingsMock },
      ],
    }).compile();
    service = moduleRef.get(VerifyService);
  });

  it('returns valid=true for an active card with a valid QR token', async () => {
    prismaMock.card.findUnique.mockResolvedValue({
      id: 1,
      uuid: '018f0000-0000-7000-8000-000000000001',
      cardNumber: 'PP-2026-000001',
      issueDate: new Date('2026-01-01'),
      expireDate: futureDate(),
      status: 'ACTIVE',
      journalist,
    });

    const result = await service.verify('018f0000-0000-7000-8000-000000000001', 'token');

    expect(result.valid).toBe(true);
    expect(result.qrStatus).toBe('VALID');
    expect(result.fullName).toBe('Іван Петренко');
  });

  it('shows the NSZHU logo only for union members', async () => {
    const base = {
      id: 1,
      uuid: '018f0000-0000-7000-8000-000000000001',
      cardNumber: 'PP-2026-000001',
      issueDate: new Date('2026-01-01'),
      expireDate: futureDate(),
      status: 'ACTIVE',
    };
    prismaMock.card.findUnique.mockResolvedValueOnce({
      ...base,
      journalist: { ...journalist, nszhuMember: false },
    });
    const nonMember = await service.verify(base.uuid, 'token');
    expect(nonMember.nszhuMember).toBe(false);
    expect(nonMember.nszhuLogoPath).toBeNull();

    prismaMock.card.findUnique.mockResolvedValueOnce({
      ...base,
      journalist: { ...journalist, nszhuMember: true },
    });
    const member = await service.verify(base.uuid, 'token');
    expect(member.nszhuMember).toBe(true);
    expect(member.nszhuLogoPath).toBe('/uploads/branding/nszhu.png');
  });

  it('reveals NO card data when the token is missing', async () => {
    qrTokenMock.check.mockResolvedValue('MISSING');

    const result = await service.verify('018f0000-0000-7000-8000-000000000001');

    expect(result).toEqual({ valid: false, qrStatus: 'MISSING' });
    expect(prismaMock.card.findUnique).not.toHaveBeenCalled();
  });

  it('reveals NO card data for an expired token (old screenshot)', async () => {
    qrTokenMock.check.mockResolvedValue('EXPIRED');

    const result = await service.verify('018f0000-0000-7000-8000-000000000001', 'stale');

    expect(result).toEqual({ valid: false, qrStatus: 'EXPIRED' });
    expect(result.fullName).toBeUndefined();
    expect(prismaMock.card.findUnique).not.toHaveBeenCalled();
  });

  it('returns valid=false with status BLOCKED for a revoked card', async () => {
    prismaMock.card.findUnique.mockResolvedValue({
      id: 1,
      uuid: '018f0000-0000-7000-8000-000000000001',
      cardNumber: 'PP-2026-000001',
      issueDate: new Date('2026-01-01'),
      expireDate: futureDate(),
      status: 'BLOCKED',
      journalist,
    });

    const result = await service.verify('018f0000-0000-7000-8000-000000000001', 'token');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('BLOCKED');
  });

  it('derives EXPIRED for an active card past its expiration date', async () => {
    prismaMock.card.findUnique.mockResolvedValue({
      id: 1,
      uuid: '018f0000-0000-7000-8000-000000000001',
      cardNumber: 'PP-2020-000001',
      issueDate: new Date('2020-01-01'),
      expireDate: new Date('2021-01-01'),
      status: 'ACTIVE',
      journalist,
    });

    const result = await service.verify('018f0000-0000-7000-8000-000000000001', 'token');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('EXPIRED');
  });

  it('throws NotFoundException for an unknown uuid (valid token)', async () => {
    prismaMock.card.findUnique.mockResolvedValue(null);

    await expect(service.verify('018f0000-0000-7000-8000-00000000dead', 'token')).rejects.toThrow(
      NotFoundException,
    );
  });
});
