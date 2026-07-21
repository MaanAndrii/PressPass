import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from '../crypto/blind-index.service';
import { EditorialsService } from './editorials.service';
describe('EditorialsService encrypted records', () => {
  const prisma: any = {
    editorial: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 1)), put: jest.fn() };
  const payloads: any = {
    encrypt: jest.fn(() => ({ version: 1, envelope: { ciphertext: 'opaque' } })),
    decrypt: jest.fn(),
  };
  const hierarchy: any = {
    provisionEditorial: jest.fn(() => Promise.resolve(Buffer.alloc(32, 2))),
    wrapOwnerForRecovery: jest.fn(),
  };
  const blind = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
  );
  const files: any = { read: jest.fn(), store: jest.fn(), cleanupReplaced: jest.fn() };
  const media: any = { put: jest.fn() };
  const service = new EditorialsService(prisma, sessions, payloads, hierarchy, blind, files, media);
  const actor: any = { sub: 1, role: 'ADMIN', editorialId: null };
  beforeEach(() => jest.clearAllMocks());
  it('encrypts all company details into the payload only and blind-indexes numbering', async () => {
    prisma.editorial.findFirst.mockResolvedValue(null);
    prisma.editorial.create.mockResolvedValue({ id: 4, publicName: 'Secret Media' });
    // A real Prisma row already carries publicName (set at create); include it so
    // hydrate's public-label backfill is skipped, matching production.
    prisma.editorial.update.mockImplementation(({ data }: any) => ({
      id: 4,
      publicName: 'Secret Media',
      ...data,
    }));
    payloads.decrypt.mockReturnValue({
      name: 'Secret Media',
      displayNameUk: '',
      displayNameEn: '',
      mediaId: '',
      edrpou: '123',
      website: '',
      logoPath: null,
      director: '',
      email: 'office@example.com',
      address: 'Kyiv',
      phone: '',
      cardNumberPrefix: 'SEC',
      cardNumberTemplate: '{prefix}-{seq:6}',
    });
    const result = await service.create(
      {
        name: 'Secret Media',
        edrpou: '123',
        email: 'office@example.com',
        address: 'Kyiv',
        cardNumberPrefix: 'SEC',
      },
      actor,
      'unlock',
    );
    expect(payloads.encrypt).toHaveBeenCalledWith(
      'editorial',
      4,
      'editorial:4',
      expect.objectContaining({ name: 'Secret Media', email: 'office@example.com' }),
      expect.any(Buffer),
    );
    expect(prisma.editorial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          encryptedData: expect.any(Object),
          cardNumberPrefixBlindIndex: expect.stringMatching(/^v1:/),
        }),
      }),
    );
    const updateData = (prisma.editorial.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('name');
    expect(updateData).not.toHaveProperty('email');
    expect(updateData).not.toHaveProperty('address');
    // The public label stays in the clear for join-request identification.
    expect((prisma.editorial.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      publicName: 'Secret Media',
    });
    expect(result.name).toBe('Secret Media');
  });
});
