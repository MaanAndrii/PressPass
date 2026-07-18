import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { MeService } from './me.service';
describe('MeService owner encrypted profile', () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    journalist: { findUnique: jest.fn(), update: jest.fn() },
    card: { findMany: jest.fn() },
  };
  const userKeys: any = { rewrap: jest.fn(), provision: jest.fn(), decryptUserData: jest.fn() };
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 4)), revokeUser: jest.fn() };
  const payloads: any = {
    encrypt: jest.fn(() => ({ version: 1, envelope: { ciphertext: 'opaque' } })),
    decrypt: jest.fn(),
  };
  const files: any = { store: jest.fn(), read: jest.fn(), cleanupReplaced: jest.fn() };
  const media: any = { put: jest.fn() };
  const hierarchy: any = {
    getEditorialReadPublicKey: jest.fn(),
    sealProfileForEditorial: jest.fn(),
  };
  const service = new MeService(
    prisma,
    new ConfigService({}),
    {} as never,
    userKeys,
    sessions,
    payloads,
    files,
    media,
    hierarchy,
  );
  beforeEach(() => jest.clearAllMocks());
  it('encrypts the complete questionnaire and scrubs legacy columns', async () => {
    prisma.journalist.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      position: '',
      positionEn: '',
      organization: '',
      organizationEn: '',
      photoPath: null,
      nszhuMember: false,
    });
    prisma.journalist.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'opaque',
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      editorialId: null,
      encryptedData: null,
      journalist: {
        id: 3,
        publicId: 'JR-ABC234',
        fullName: '',
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
        selfRegistered: true,
        encryptedData: null,
        memberships: [],
      },
    });
    await expect(
      service.updateProfile(
        7,
        {
          fullName: 'Secret Person',
          fullNameEn: '',
          birthDate: '1990-01-01',
          passportData: 'AA123',
          taxNumber: '123',
          phone: '+380',
        },
        'unlock',
      ),
    ).resolves.toMatchObject({ id: 7 });
    expect(payloads.encrypt).toHaveBeenCalledWith(
      'journalist',
      3,
      'user:7',
      expect.objectContaining({ fullName: 'Secret Person', passportData: 'AA123' }),
      expect.any(Buffer),
    );
    expect(prisma.journalist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: '',
          passportData: null,
          taxNumber: null,
          phone: null,
          encryptedData: expect.any(Object),
        }),
      }),
    );
  });
  it('rewraps the same DEK on password change and revokes every unlock session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      passwordHash: await argon2.hash('old-password'),
      passwordKdf: {},
      dataKeyEnvelope: {},
    });
    userKeys.rewrap.mockResolvedValue({
      passwordKdf: { new: true },
      dataKeyEnvelope: { new: true },
    });
    prisma.user.update.mockResolvedValue({});
    await service.changePassword(7, 'old-password', 'new-password');
    expect(userKeys.rewrap).toHaveBeenCalled();
    expect(sessions.revokeUser).toHaveBeenCalledWith(7);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      }),
    );
  });
});
