import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from '../crypto/blind-index.service';
import { CardsService } from './cards.service';
describe('CardsService encrypted credentials', () => {
  const journalist: any = {
    id: 2,
    userId: 9,
    fullName: 'Owner',
    fullNameEn: '',
    position: '',
    positionEn: '',
    organization: '',
    organizationEn: '',
    photoPath: '/media/file',
    birthDate: new Date(),
    passportData: 'P',
    taxNumber: 'T',
    phone: '1',
    nszhuMember: false,
    selfRegistered: true,
    encryptedData: {},
  };
  const editorial: any = {
    id: 3,
    name: '',
    displayNameUk: '',
    displayNameEn: '',
    mediaId: '',
    edrpou: '',
    website: '',
    logoPath: null,
    director: '',
    email: '',
    address: '',
    phone: '',
    cardNumberPrefix: '',
    cardNumberTemplate: '{prefix}-{year}-{seq:6}',
    encryptedData: {},
  };
  const prisma: any = {
    journalist: { findUnique: jest.fn() },
    editorial: { findUnique: jest.fn() },
    editorialDataKeyGrant: { findUnique: jest.fn() },
    card: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const sessions: any = { key: jest.fn(() => Buffer.alloc(32, 1)) };
  const payloads: any = {
    encrypt: jest.fn(() => ({ version: 1, envelope: { ciphertext: 'opaque' } })),
    decrypt: jest.fn(),
  };
  const hierarchy: any = { unwrapProfileForEditorial: jest.fn(() => Buffer.alloc(32, 2)) };
  const blind = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-key-that-is-at-least-32-bytes-long' }),
  );
  const files: any = { read: jest.fn(), store: jest.fn() };
  const qr: any = { ttlSeconds: 60 };
  const qrProjections: any = { put: jest.fn(() => 'projection-id') };
  const service = new CardsService(
    prisma,
    new ConfigService({}),
    qr,
    qrProjections,
    sessions,
    payloads,
    hierarchy,
    blind,
    files,
  );
  const actor: any = { sub: 1, role: 'EDITORIAL_ADMIN', editorialId: 3 };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.journalist.findUnique.mockResolvedValue(journalist);
    prisma.editorial.findUnique.mockResolvedValue(editorial);
    prisma.editorialDataKeyGrant.findUnique.mockResolvedValue({ keyEnvelope: {} });
    payloads.decrypt.mockImplementation((entity: string) =>
      entity === 'journalist'
        ? {
            fullName: 'Owner',
            fullNameEn: '',
            photoPath: '/media/file',
            birthDate: '1990-01-01',
            passportData: 'P',
            taxNumber: 'T',
            phone: '1',
            nszhuMember: false,
          }
        : {
            name: 'Secret Media',
            displayNameUk: 'Secret',
            displayNameEn: '',
            mediaId: '',
            cardNumberPrefix: '',
            cardNumberTemplate: '{prefix}-{year}-{seq:6}',
            website: '',
            logoPath: null,
          },
    );
    prisma.card.findFirst.mockResolvedValue(null);
    prisma.card.create.mockImplementation(({ data }: any) => ({
      id: 11,
      ...data,
      journalist,
      editorial,
    }));
    prisma.card.update.mockImplementation(({ data }: any) => ({
      id: 11,
      uuid: '01900000-0000-7000-8000-000000000000',
      status: 'ACTIVE',
      editorialId: 3,
      journalistId: 2,
      numberSeq: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      journalist,
      editorial,
    }));
  });
  it('stores card number, position and dates only in the owner-encrypted payload', async () => {
    const result = await service.create(
      { journalistId: 2, editorialId: 3, position: 'Reporter', expireDate: '2099-01-01' },
      actor,
      'unlock',
    );
    expect(payloads.encrypt).toHaveBeenCalledWith(
      'card',
      11,
      'user:9',
      expect.objectContaining({
        position: 'Reporter',
        cardNumber: expect.any(String),
        expireDate: expect.any(String),
      }),
      expect.any(Buffer),
    );
    expect(prisma.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cardNumberBlindIndex: expect.stringMatching(/^v1:/),
        }),
      }),
    );
    // The number, position and dates must live only in the encrypted payload —
    // there are no plaintext columns to write them to anymore.
    const createArg = prisma.card.create.mock.calls[0][0].data;
    expect(createArg).not.toHaveProperty('cardNumber');
    expect(createArg).not.toHaveProperty('position');
    expect(createArg).not.toHaveProperty('issueDate');
    expect(createArg).not.toHaveProperty('expireDate');
    expect(result.position).toBe('Reporter');
  });
});
