import { DataEncryptionService } from './data-encryption.service';
import { KeyHierarchyService } from './key-hierarchy.service';
import type { PrismaService } from '../prisma/prisma.service';

/** In-memory stand-in for a single editorial_key_material row. */
function createPrismaStub(editorialId: number) {
  let row: Record<string, unknown> = {
    id: 1,
    editorialId,
    readPublicKey: null,
    readPrivateKeyEnvelope: null,
  };
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    row = { ...row, ...data };
    return row;
  });
  return {
    update,
    editorialKeyMaterial: {
      findUnique: jest.fn(async () => row),
      findUniqueOrThrow: jest.fn(async () => row),
      update,
    },
  };
}

describe('KeyHierarchyService editorial read key', () => {
  const crypto = new DataEncryptionService();
  const editorialId = 7;
  let prisma: ReturnType<typeof createPrismaStub>;
  let hierarchy: KeyHierarchyService;

  beforeEach(() => {
    prisma = createPrismaStub(editorialId);
    hierarchy = new KeyHierarchyService(prisma as unknown as PrismaService, crypto);
  });

  it('seals a profile key that the Editorial KEK can recover', async () => {
    const editorialKey = crypto.generateDataKey();
    const profileKey = crypto.generateDataKey();
    const publicKey = await hierarchy.ensureEditorialReadKey(editorialId, editorialKey);
    expect(publicKey).toContain('BEGIN PUBLIC KEY');

    const sealed = hierarchy.sealProfileForEditorial(profileKey, publicKey);
    const recovered = await hierarchy.unsealProfileForEditorial(editorialId, sealed, editorialKey);
    expect(recovered.equals(profileKey)).toBe(true);
  });

  it('does not recover the profile key with a different Editorial KEK', async () => {
    const editorialKey = crypto.generateDataKey();
    const profileKey = crypto.generateDataKey();
    const publicKey = await hierarchy.ensureEditorialReadKey(editorialId, editorialKey);
    const sealed = hierarchy.sealProfileForEditorial(profileKey, publicKey);

    await expect(
      hierarchy.unsealProfileForEditorial(editorialId, sealed, crypto.generateDataKey()),
    ).rejects.toThrow();
  });
});
