import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationService } from './registration.service';
import { createJwtServiceMock } from './testing/jwt-service.mock';
describe('RegistrationService encrypted registration', () => {
  let service: RegistrationService;
  const prisma: any = {
    $transaction: jest.fn(),
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    emailVerification: { upsert: jest.fn(), update: jest.fn() },
  };
  const keys = {
    provision: jest.fn().mockResolvedValue({
      passwordKdf: {},
      dataKeyEnvelope: {},
      encryptedData: { ciphertext: 'opaque' },
    }),
  };
  const sent: string[] = [];
  const blind = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
  );
  beforeEach(async () => {
    jest.clearAllMocks();
    sent.length = 0;
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    const module = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserKeyMaterialService, useValue: keys },
        { provide: BlindIndexService, useValue: blind },
        { provide: KeyHierarchyService, useValue: { wrapOwnerForRecovery: jest.fn() } },
        { provide: JwtService, useValue: createJwtServiceMock() },
        {
          provide: MailService,
          useValue: {
            sendVerificationCode: jest.fn((_: string, c: string) => {
              sent.push(c);
            }),
          },
        },
      ],
    }).compile();
    service = module.get(RegistrationService);
  });
  it('stores a blind-index lookup and encrypted email payload instead of plaintext', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 7 });
    await service.register(' New@Example.com ', 'StrongPass123!');
    const index = blind.email('new@example.com');
    expect(keys.provision).toHaveBeenCalledWith(
      7,
      'StrongPass123!',
      { email: 'new@example.com' },
      expect.any(Function),
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailBlindIndex: index }),
      }),
    );
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('email');
    expect(JSON.stringify(prisma.user.create.mock.calls)).not.toContain('new@example.com');
    expect(JSON.stringify(prisma.user.update.mock.calls)).not.toContain('new@example.com');
    expect(sent[0]).toMatch(/^\d{6}$/);
    expect(prisma.emailVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ code: expect.stringMatching(/^v1:/) }),
      }),
    );
  });
  it('compares an HMAC verification value and never persists the raw code', async () => {
    const hash = blind.verificationCode(5, '123456');
    prisma.user.findFirst.mockResolvedValue({
      id: 5,
      email: 'opaque',
      role: 'JOURNALIST',
      tokenVersion: 0,
      emailVerifiedAt: null,
      journalist: null,
      verification: { id: 1, code: hash, attempts: 0, expiresAt: new Date(Date.now() + 10000) },
    });
    prisma.user.update.mockResolvedValue({
      id: 5,
      email: 'opaque',
      role: 'JOURNALIST',
      tokenVersion: 0,
      emailVerifiedAt: new Date(),
      journalist: null,
    });
    await expect(service.verifyEmail('v@example.com', '123456')).resolves.toMatchObject({
      accessToken: 'signed.jwt.token',
    });
  });
  it('counts a wrong verification attempt', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 5,
      emailVerifiedAt: null,
      verification: {
        id: 1,
        code: blind.verificationCode(5, '123456'),
        attempts: 0,
        expiresAt: new Date(Date.now() + 10000),
      },
    });
    await expect(service.verifyEmail('v@example.com', '000000')).rejects.toThrow('Невірний код');
    expect(prisma.emailVerification.update).toHaveBeenCalled();
  });
});
