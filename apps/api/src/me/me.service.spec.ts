import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { MeService } from './me.service';
describe('MeService owner encrypted profile', () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    journalist: { findUnique: jest.fn(), update: jest.fn() },
    card: { findMany: jest.fn() },
    editorialMembership: { count: jest.fn(() => Promise.resolve(0)) },
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
    { put: jest.fn() } as never,
    userKeys,
    sessions,
    payloads,
    files,
    media,
    hierarchy,
  );
  beforeEach(() => jest.clearAllMocks());
  it('encrypts the complete questionnaire into the payload only', async () => {
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
        data: expect.objectContaining({ encryptedData: expect.any(Object) }),
      }),
    );
    const updateData = (prisma.journalist.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('fullName');
    expect(updateData).not.toHaveProperty('passportData');
  });
  it('preserves the photo and editorial fields when saving the questionnaire', async () => {
    // Photo/position live inside encryptedData; the scrubbed columns read null.
    prisma.journalist.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      photoPath: null,
      position: '',
      organization: '',
      nszhuMember: false,
      encryptedData: { ciphertext: 'opaque' },
    });
    payloads.decrypt.mockReturnValue({
      photoPath: '/media/photo-id',
      position: 'Кореспондент',
      organization: 'Медіа',
    });
    prisma.journalist.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'opaque',
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      editorialId: null,
      encryptedData: null,
      journalist: { id: 3, publicId: 'JR-X', encryptedData: null, memberships: [] },
    });
    await service.updateProfile(
      7,
      {
        fullName: 'Іван Петренко',
        fullNameEn: '',
        birthDate: '1990-01-01',
        passportData: 'AA123456',
        taxNumber: '1234567890',
        phone: '+380501112233',
      },
      'unlock',
    );
    expect(payloads.encrypt).toHaveBeenCalledWith(
      'journalist',
      3,
      'user:7',
      expect.objectContaining({
        fullName: 'Іван Петренко',
        photoPath: '/media/photo-id',
        position: 'Кореспондент',
        organization: 'Медіа',
      }),
      expect.any(Buffer),
    );
  });
  it('degrades /me for an admin without a profile key instead of throwing', async () => {
    // An admin signed in via Google has no password-derived 'profile' key, so
    // the email envelope cannot be opened — /me must still return, not 400.
    sessions.key.mockImplementation(() => {
      throw new Error('Requested key is not unlocked');
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 5,
      email: 'blind-index-value',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      editorialId: null,
      encryptedData: { ciphertext: 'opaque' },
      journalist: null,
    });
    await expect(service.getProfile(5, 'unlock-token')).resolves.toMatchObject({
      id: 5,
      role: 'ADMIN',
      email: '',
    });
  });
  it('still requires a profile key for a journalist (re-unlock path)', async () => {
    sessions.key.mockImplementation(() => {
      throw new Error('Requested key is not unlocked');
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 8,
      email: 'blind',
      role: 'JOURNALIST',
      emailVerifiedAt: new Date(),
      editorialId: null,
      encryptedData: { ciphertext: 'opaque' },
      journalist: null,
    });
    await expect(service.getProfile(8, 'unlock-token')).rejects.toThrow(
      'Encryption unlock required',
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
