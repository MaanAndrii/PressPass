import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService } from '../qr/qr-token.service';
import { MeService } from './me.service';

describe('MeService password encryption lifecycle', () => {
  let service: MeService;
  const prismaMock = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const userKeysMock = {
    provision: jest.fn().mockResolvedValue({
      passwordKdf: { version: 1, algorithm: 'ARGON2ID', salt: 'provisioned' },
      dataKeyEnvelope: {
        version: 1,
        algorithm: 'AES-256-GCM',
        ciphertext: 'provisioned',
      },
    }),
    rewrap: jest.fn().mockResolvedValue({
      passwordKdf: { version: 1, algorithm: 'ARGON2ID', salt: 'new' },
      dataKeyEnvelope: { version: 1, algorithm: 'AES-256-GCM', ciphertext: 'new' },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: QrTokenService, useValue: {} },
        { provide: UserKeyMaterialService, useValue: userKeysMock },
      ],
    }).compile();
    service = moduleRef.get(MeService);
  });

  it('atomically updates the password hash and rewrapped data key material', async () => {
    const oldKdf = { version: 1, algorithm: 'ARGON2ID', salt: 'old' };
    const oldEnvelope = { version: 1, algorithm: 'AES-256-GCM', ciphertext: 'old' };
    prismaMock.user.findUnique.mockResolvedValue({
      id: 5,
      passwordHash: await argon2.hash('old-password'),
      passwordKdf: oldKdf,
      dataKeyEnvelope: oldEnvelope,
    });
    prismaMock.user.update.mockResolvedValue({});

    await expect(service.changePassword(5, 'old-password', 'new-password')).resolves.toEqual({
      success: true,
    });

    expect(userKeysMock.rewrap).toHaveBeenCalledWith(
      5,
      'old-password',
      'new-password',
      oldKdf,
      oldEnvelope,
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        passwordKdf: expect.objectContaining({ salt: 'new' }),
        dataKeyEnvelope: expect.objectContaining({ ciphertext: 'new' }),
      }),
    });
    const updatedHash = prismaMock.user.update.mock.calls[0][0].data.passwordHash as string;
    await expect(argon2.verify(updatedHash, 'new-password')).resolves.toBe(true);
  });

  it('provisions encryption material when a legacy account changes its password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 6,
      passwordHash: await argon2.hash('old-password'),
      passwordKdf: null,
      dataKeyEnvelope: null,
    });
    prismaMock.user.update.mockResolvedValue({});

    await service.changePassword(6, 'old-password', 'new-password');

    expect(userKeysMock.rewrap).not.toHaveBeenCalled();
    expect(userKeysMock.provision).toHaveBeenCalledWith(6, 'new-password');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        passwordKdf: expect.objectContaining({ salt: 'provisioned' }),
        dataKeyEnvelope: expect.objectContaining({ ciphertext: 'provisioned' }),
      }),
    });
  });

  it('refuses to change the password when only half of the key material exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      passwordHash: await argon2.hash('old-password'),
      passwordKdf: { version: 1 },
      dataKeyEnvelope: null,
    });

    await expect(service.changePassword(7, 'old-password', 'new-password')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
