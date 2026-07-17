import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { createJwtServiceMock } from './testing/jwt-service.mock';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const userKeysMock = {
    unlock: jest.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    createRecoveryGrant: jest.fn().mockReturnValue({ version: 1, ciphertext: 'recovery' }),
  };
  const editorialGrantsMock = { sync: jest.fn() };
  const jwtServiceMock = createJwtServiceMock();

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UserKeyMaterialService, useValue: userKeysMock },
        { provide: EditorialKeyGrantService, useValue: editorialGrantsMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('returns a token and profile for valid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@presspass.local',
      passwordHash: await argon2.hash('correct-password'),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      journalist: null,
    });

    const result = await service.login('admin@presspass.local', 'correct-password');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).toMatchObject({ id: 1, email: 'admin@presspass.local', role: 'ADMIN' });
  });

  it('unlocks and clears the data key for an encrypted password account', async () => {
    const unlockedKey = Buffer.alloc(32, 9);
    userKeysMock.unlock.mockResolvedValueOnce(unlockedKey);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      email: 'encrypted@example.com',
      passwordHash: await argon2.hash('correct-password'),
      passwordKdf: { version: 1, algorithm: 'ARGON2ID' },
      dataKeyEnvelope: { version: 1, algorithm: 'AES-256-GCM' },
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      editorialId: null,
      journalist: null,
    });

    await service.login('encrypted@example.com', 'correct-password');

    expect(userKeysMock.unlock).toHaveBeenCalledWith(
      8,
      'correct-password',
      expect.any(Object),
      expect.any(Object),
    );
    expect(unlockedKey).toEqual(Buffer.alloc(32));
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { recoveryKeyEnvelope: { version: 1, ciphertext: 'recovery' } },
    });
  });

  it('rejects an account whose wrapped data key cannot be unlocked', async () => {
    userKeysMock.unlock.mockRejectedValueOnce(new Error('Decryption failed'));
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      email: 'encrypted@example.com',
      passwordHash: await argon2.hash('correct-password'),
      passwordKdf: { version: 1 },
      dataKeyEnvelope: { version: 1 },
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      journalist: null,
    });

    await expect(service.login('encrypted@example.com', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('normalizes the email before lookup', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.login('  Admin@PressPass.LOCAL ', 'whatever-pass')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'admin@presspass.local' } }),
    );
  });

  it('rejects an unknown email with a generic error', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.login('nobody@example.com', 'password123')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('rejects a wrong password with the same generic error', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@presspass.local',
      passwordHash: await argon2.hash('correct-password'),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      journalist: null,
    });

    await expect(service.login('admin@presspass.local', 'wrong-password')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('rejects a Google-only account (no password) with the same generic error', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 4,
      email: 'google@example.com',
      passwordHash: null,
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      journalist: null,
    });

    await expect(service.login('google@example.com', 'any-password-1')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('rejects sign-in until the email is verified', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 3,
      email: 'new@example.com',
      passwordHash: await argon2.hash('correct-password'),
      role: 'JOURNALIST',
      emailVerifiedAt: null,
      journalist: null,
    });

    await expect(service.login('new@example.com', 'correct-password')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('includes the journalist profile when present', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 2,
      email: 'journalist@presspass.local',
      passwordHash: await argon2.hash('secret-password'),
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      journalist: {
        id: 10,
        publicId: 'JR-ABC234',
        fullName: 'Іван Петренко',
        position: 'Кореспондент',
        organization: 'Редакція «Приклад»',
        photoPath: null,
        birthDate: null,
        passportData: null,
        taxNumber: null,
        phone: null,
        selfRegistered: false,
        memberships: [],
      },
    });

    const result = await service.login('journalist@presspass.local', 'secret-password');

    expect(result.user.journalist).toMatchObject({
      id: 10,
      fullName: 'Іван Петренко',
      position: 'Кореспондент',
      organization: 'Редакція «Приклад»',
      profileComplete: false,
    });
  });

  it('revokes all existing access tokens on logout', async () => {
    prismaMock.user.update.mockResolvedValue({});

    await expect(service.logout(7)).resolves.toEqual({ success: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
