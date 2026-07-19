import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from '../crypto/blind-index.service';
import { JournalistsService } from './journalists.service';
describe('JournalistsService encrypted profile creation', () => {
  const prisma: any = {
    $transaction: jest.fn(),
    journalist: { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    user: { findFirst: jest.fn(), update: jest.fn() },
    editorialDataKeyGrant: { upsert: jest.fn() },
  };
  const keys: any = {
    provision: jest.fn(async (_userId: number, _password: string, _data: unknown, cb?: any) => {
      // Invoke the callback with a DEK so create() can capture the profile key.
      if (cb) await cb(Buffer.alloc(32, 2));
      return { passwordKdf: {}, dataKeyEnvelope: {}, encryptedData: {} };
    }),
    unlock: jest.fn(() => Promise.resolve(Buffer.alloc(32, 2))),
    decryptUserData: jest.fn(() => ({ email: 'owner@example.com' })),
  };
  const grants: any = { revoke: jest.fn() };
  const blind = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
  );
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 3)) };
  const payloads: any = {
    encrypt: jest.fn(() => ({ version: 1, envelope: { ciphertext: 'opaque' } })),
    decrypt: jest.fn(() => ({
      fullName: 'Secret Owner',
      fullNameEn: '',
      position: '',
      positionEn: '',
      organization: '',
      organizationEn: '',
      photoPath: null,
      birthDate: null,
      passportData: null,
      taxNumber: null,
      phone: null,
      nszhuMember: false,
    })),
  };
  const hierarchy: any = {
    wrapProfileForEditorial: jest.fn(() => ({ wrapped: 'profile' })),
    wrapOwnerForRecovery: jest.fn(() => Promise.resolve()),
    getSystemReadPublicKey: jest.fn(() => Promise.resolve(null)),
    sealProfileForSystem: jest.fn(() => ({ sealed: true })),
  };
  const files: any = {};
  const media: any = {};
  const service = new JournalistsService(
    prisma,
    keys,
    grants,
    blind,
    sessions,
    payloads,
    hierarchy,
    files,
    media,
  );
  const actor: any = { sub: 4, role: 'EDITORIAL_ADMIN', editorialId: 5 };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.user.findFirst.mockResolvedValue(null);
    const created: any = {
      id: 10,
      userId: 8,
      publicId: 'JR-ABC234',
      fullName: 'Secret Owner',
      fullNameEn: '',
      position: '',
      positionEn: '',
      organization: '',
      organizationEn: '',
      photoPath: null,
      birthDate: null,
      passportData: null,
      taxNumber: null,
      phone: null,
      nszhuMember: false,
      selfRegistered: false,
      encryptedData: null,
      user: {
        id: 8,
        email: 'opaque',
        emailVerifiedAt: new Date(),
        passwordKdf: {},
        dataKeyEnvelope: {},
        encryptedData: {},
      },
      _count: { cards: 0 },
      memberships: [{ editorialId: 5, editorial: { id: 5, name: '' } }],
    };
    prisma.journalist.create.mockResolvedValue(created);
    prisma.journalist.findUniqueOrThrow.mockResolvedValue({
      ...created,
      fullName: '',
      encryptedData: {},
    });
    prisma.journalist.update.mockResolvedValue({});
  });
  it('encrypts PII, scrubs Prisma profile columns and creates an owner-key editorial grant', async () => {
    await service.create(
      { email: 'Owner@Example.com', password: 'password123', fullName: 'Secret Owner' },
      actor,
      'unlock',
    );
    const index = blind.email('owner@example.com');
    expect(prisma.journalist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: expect.objectContaining({
            create: expect.objectContaining({ email: index, emailBlindIndex: index }),
          }),
        }),
      }),
    );
    expect(prisma.journalist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: '',
          passportData: null,
          encryptedData: expect.any(Object),
        }),
      }),
    );
    expect(prisma.editorialDataKeyGrant.upsert).toHaveBeenCalled();
  });
});
