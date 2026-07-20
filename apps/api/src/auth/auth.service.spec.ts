import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { createJwtServiceMock } from './testing/jwt-service.mock';
describe('AuthService encrypted login', () => {
  let service: AuthService;
  const prisma = { user: { findFirst: jest.fn(), update: jest.fn() } };
  const key = Buffer.alloc(32, 7);
  const userKeys = {
    unlock: jest.fn(() => Promise.resolve(Buffer.from(key))),
    decryptUserData: jest.fn(() => ({ email: 'owner@example.com' })),
  };
  const sessions = new UnlockSessionService();
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: createJwtServiceMock() },
        { provide: UserKeyMaterialService, useValue: userKeys },
        { provide: UnlockSessionService, useValue: sessions },
        {
          provide: BlindIndexService,
          useValue: new BlindIndexService(
            new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
          ),
        },
        { provide: DomainPayloadService, useValue: { decrypt: jest.fn() } },
        {
          provide: KeyHierarchyService,
          useValue: {
            getSystemReadPublicKey: jest.fn(() => Promise.resolve(null)),
            sealProfileForSystem: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });
  it('looks up a normalized blind index, unwraps the DEK and creates an opaque unlock session', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 1,
      email: 'v1:opaque',
      emailBlindIndex: 'v1:opaque',
      encryptedData: {},
      passwordHash: await argon2.hash('correct-password'),
      passwordKdf: {},
      dataKeyEnvelope: {},
      recoveryKeyEnvelope: null,
      tokenVersion: 0,
      role: 'JOURNALIST',
      editorialId: null,
      emailVerifiedAt: new Date(),
      journalist: null,
      adminKeyMaterial: null,
    });
    const result = await service.login(' OWNER@Example.com ', 'correct-password');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
    expect(result.user.email).toBe('owner@example.com');
    expect(result.unlockToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.unlockToken).not.toContain(key.toString('base64'));
  });
  it('fails closed when the wrapped DEK cannot be opened', async () => {
    userKeys.unlock.mockRejectedValueOnce(new Error('bad envelope'));
    prisma.user.findFirst.mockResolvedValue({
      id: 1,
      passwordHash: await argon2.hash('correct-password'),
      passwordKdf: {},
      dataKeyEnvelope: {},
      role: 'JOURNALIST',
      journalist: null,
    });
    await expect(service.login('owner@example.com', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('uses the same generic error for unknown, wrong-password and Google-only accounts', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.login('x@y.z', 'password123')).rejects.toThrow(
      'Invalid email or password',
    );
    prisma.user.findFirst.mockResolvedValue({ passwordHash: null });
    await expect(service.login('x@y.z', 'password123')).rejects.toThrow(
      'Invalid email or password',
    );
  });
  it('rejects an unverified account', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 2,
      email: 'opaque',
      passwordHash: await argon2.hash('pass12345'),
      passwordKdf: null,
      dataKeyEnvelope: null,
      role: 'JOURNALIST',
      emailVerifiedAt: null,
      journalist: null,
    });
    await expect(service.login('x@y.z', 'pass12345')).rejects.toThrow(ForbiddenException);
  });
  it('destroys unlock material on per-device logout without bumping tokenVersion', async () => {
    prisma.user.update.mockResolvedValue({});
    const token = sessions.create(9, new Map([['profile', key]])).token;
    service.logout(9);
    expect(() => sessions.key(token, 9, 'profile')).toThrow();
    // Other devices stay signed in — no tokenVersion bump on a single-device logout.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('bumps tokenVersion to revoke every device on logout-all', async () => {
    prisma.user.update.mockResolvedValue({});
    const token = sessions.create(9, new Map([['profile', key]])).token;
    await service.logoutAll(9);
    expect(() => sessions.key(token, 9, 'profile')).toThrow();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
