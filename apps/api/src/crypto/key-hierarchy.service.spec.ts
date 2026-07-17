import { DataEncryptionService } from './data-encryption.service';
import { KeyHierarchyService } from './key-hierarchy.service';
describe('KeyHierarchyService owner slots', () => {
  const encryption = new DataEncryptionService();
  it('wraps one profile DEK independently for an editorial owner key', () => {
    const service = new KeyHierarchyService({} as never, encryption);
    const profile = encryption.generateDataKey(),
      editorial = encryption.generateDataKey();
    const envelope = service.wrapProfileForEditorial(7, 3, profile, editorial);
    expect(JSON.stringify(envelope)).not.toContain(profile.toString('base64url'));
    expect(service.unwrapProfileForEditorial(7, 3, envelope, editorial)).toEqual(profile);
    expect(() => service.unwrapProfileForEditorial(7, 4, envelope, editorial)).toThrow(
      'Decryption failed',
    );
    profile.fill(0);
    editorial.fill(0);
  });
  it('creates two asymmetric recovery authorities and recovers through either offline private-key kit', async () => {
    const authorities: any[] = [];
    const slots: any[] = [];
    const prisma: any = {
      superadminRecoveryKey: {
        findUnique: jest.fn(() => null),
        create: jest.fn(({ data }: any) => {
          const row = { id: authorities.length + 1, revokedAt: null, ...data };
          authorities.push(row);
          return row;
        }),
        findMany: jest.fn(() => authorities),
        findUniqueOrThrow: jest.fn(({ where }: any) =>
          authorities.find((item) => item.id === where.id),
        ),
      },
      superadminKeySlot: {
        upsert: jest.fn(({ create }: any) => {
          const row = { id: slots.length + 1, revokedAt: null, ...create };
          slots.push(row);
          return row;
        }),
        findFirstOrThrow: jest.fn(({ where }: any) =>
          slots.find(
            (item) =>
              item.recoveryKeyId === where.recoveryKeyId &&
              (!where.ownerId || item.ownerId === where.ownerId),
          ),
        ),
      },
    };
    const service = new KeyHierarchyService(prisma, encryption),
      owner = encryption.generateDataKey();
    const kits = await service.createRecoverySlots({
      ownerType: 'user',
      ownerId: '9',
      ownerKey: owner,
      superadminUserIds: [1, 1],
      recoveryPassphrases: ['first recovery phrase', 'second recovery phrase'],
    });
    expect(kits).toHaveLength(2);
    expect(authorities[0].publicKey).toContain('PUBLIC KEY');
    expect(JSON.stringify(slots)).not.toContain(owner.toString('base64url'));
    const recovered = await service.recoverOwnerKey(
      kits[1]!,
      'second recovery phrase',
      'user',
      '9',
    );
    expect(recovered.key).toEqual(owner);
    recovered.key.fill(0);
    owner.fill(0);
  });
});
