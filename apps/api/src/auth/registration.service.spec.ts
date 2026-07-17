import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationService } from './registration.service';
import { createJwtServiceMock } from './testing/jwt-service.mock';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let sentCodes: string[];

  const prismaMock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerification: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const userKeysMock = {
    provision: jest.fn().mockResolvedValue({
      passwordKdf: { version: 1, algorithm: 'ARGON2ID' },
      dataKeyEnvelope: { version: 1, algorithm: 'AES-256-GCM' },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
    sentCodes = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UserKeyMaterialService, useValue: userKeysMock },
        {
          provide: JwtService,
          useValue: createJwtServiceMock(),
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationCode: jest.fn((_to: string, code: string) => {
              sentCodes.push(code);
              return Promise.resolve();
            }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RegistrationService);
  });

  describe('register', () => {
    it('creates a self-registered journalist and emails a 6-digit code', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ id: 7, email: 'new@example.com' });
      prismaMock.emailVerification.upsert.mockResolvedValue({});

      const result = await service.register('New@Example.com ', 'Str0ngPass!');

      expect(result.success).toBe(true);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            role: 'JOURNALIST',
            journalist: {
              create: expect.objectContaining({
                selfRegistered: true,
                publicId: expect.stringMatching(/^JR-/),
              }),
            },
          }),
        }),
      );
      expect(sentCodes).toHaveLength(1);
      expect(sentCodes[0]).toMatch(/^\d{6}$/);
      expect(userKeysMock.provision).toHaveBeenCalledWith(7, 'Str0ngPass!');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({
          passwordKdf: expect.any(Object),
          dataKeyEnvelope: expect.any(Object),
        }),
      });
    });

    it('rejects an email that is already verified', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, emailVerifiedAt: new Date() });

      await expect(service.register('taken@example.com', 'Str0ngPass!')).rejects.toThrow(
        ConflictException,
      );
    });

    it('re-sends a code for an unfinished registration instead of failing', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 3, emailVerifiedAt: null });
      prismaMock.user.update.mockResolvedValue({});
      prismaMock.emailVerification.upsert.mockResolvedValue({});

      const result = await service.register('half@example.com', 'NewPass123!');

      expect(result.success).toBe(true);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(userKeysMock.provision).toHaveBeenCalledWith(3, 'NewPass123!');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
          passwordKdf: expect.any(Object),
          dataKeyEnvelope: expect.any(Object),
        }),
      });
      expect(sentCodes).toHaveLength(1);
    });
  });

  describe('verifyEmail', () => {
    const baseUser = {
      id: 5,
      email: 'v@example.com',
      role: 'JOURNALIST',
      emailVerifiedAt: null,
      journalist: null,
    };

    it('activates the account and returns a token for the correct code', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        verification: {
          id: 9,
          code: '123456',
          attempts: 0,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      prismaMock.user.update.mockResolvedValue({
        ...baseUser,
        emailVerifiedAt: new Date(),
        journalist: null,
      });

      const result = await service.verifyEmail('v@example.com', '123456');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.emailVerified).toBe(true);
    });

    it('rejects a wrong code and counts the attempt', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        verification: {
          id: 9,
          code: '123456',
          attempts: 0,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await expect(service.verifyEmail('v@example.com', '000000')).rejects.toThrow('Невірний код');
      expect(prismaMock.emailVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('rejects an expired code', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        verification: {
          id: 9,
          code: '123456',
          attempts: 0,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await expect(service.verifyEmail('v@example.com', '123456')).rejects.toThrow(
        'Код прострочено',
      );
    });

    it('locks out after too many attempts', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        verification: {
          id: 9,
          code: '123456',
          attempts: 5,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await expect(service.verifyEmail('v@example.com', '123456')).rejects.toThrow(
        'Забагато спроб',
      );
    });

    it('rejects verification for an already verified account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...baseUser,
        emailVerifiedAt: new Date(),
        verification: null,
      });

      await expect(service.verifyEmail('v@example.com', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
