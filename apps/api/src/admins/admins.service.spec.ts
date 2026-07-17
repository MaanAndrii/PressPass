import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from '../crypto/blind-index.service';
import { AdminsService } from './admins.service';
describe('AdminsService key enrollment', () => {
  const prisma: any = {
    $transaction: jest.fn(),
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    editorial: { findUnique: jest.fn(), findMany: jest.fn() },
    adminKeyMaterial: {},
  };
  const userKeys: any = {
    provision: jest.fn(() =>
      Promise.resolve({ passwordKdf: {}, dataKeyEnvelope: {}, encryptedData: {} }),
    ),
  };
  const hierarchy: any = {
    enrollAdmin: jest.fn(() => Promise.resolve(Buffer.alloc(32, 2))),
    grantEditorialToAdmin: jest.fn(),
    grantSystemToAdmin: jest.fn(),
  };
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 3)) };
  const blind = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
  );
  let service: AdminsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    service = new AdminsService(prisma, userKeys, blind, hierarchy, sessions);
  });
  it('creates no plaintext email and wraps a distinct Admin KEK', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.editorial.findUnique.mockResolvedValue({ id: 5, name: 'opaque' });
    prisma.user.create.mockResolvedValue({ id: 8 });
    prisma.user.update.mockResolvedValue({
      id: 8,
      email: 'opaque',
      editorialId: 5,
      createdAt: new Date(),
    });
    await service.create(
      {
        email: 'Admin@Example.com',
        password: 'password123',
        encryptionPassphrase: 'separate crypto passphrase',
        role: 'EDITORIAL_ADMIN',
        editorialId: 5,
      },
      { sub: 1, role: 'ADMIN', email: '', editorialId: null },
      'unlock',
    );
    const index = blind.email('admin@example.com');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: index, emailBlindIndex: index }),
      }),
    );
    expect(hierarchy.enrollAdmin).toHaveBeenCalledWith(8, 'separate crypto passphrase');
    expect(hierarchy.grantEditorialToAdmin).toHaveBeenCalled();
  });
});
