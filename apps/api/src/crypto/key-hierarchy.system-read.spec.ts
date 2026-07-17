import { DataEncryptionService } from './data-encryption.service';
import { KeyHierarchyService } from './key-hierarchy.service';
import type { PrismaService } from '../prisma/prisma.service';

/** In-memory stand-in for the single system_key_material row. */
function createPrismaStub() {
  let row: Record<string, unknown> = {
    id: 1,
    readPublicKey: null,
    readPrivateKeyEnvelope: null,
  };
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    row = { ...row, ...data };
    return row;
  });
  return {
    update,
    systemKeyMaterial: {
      findUnique: jest.fn(async () => row),
      findUniqueOrThrow: jest.fn(async () => row),
      update,
    },
  };
}

describe('KeyHierarchyService system read key', () => {
  const crypto = new DataEncryptionService();
  let prisma: ReturnType<typeof createPrismaStub>;
  let hierarchy: KeyHierarchyService;

  beforeEach(() => {
    prisma = createPrismaStub();
    hierarchy = new KeyHierarchyService(prisma as unknown as PrismaService, crypto);
  });

  it('seals a profile key that the System KEK can recover', async () => {
    const systemKey = crypto.generateDataKey();
    const profileKey = crypto.generateDataKey();
    const publicKey = await hierarchy.ensureSystemReadKey(systemKey);
    expect(publicKey).toContain('BEGIN PUBLIC KEY');

    const sealed = hierarchy.sealProfileForSystem(profileKey, publicKey);
    const recovered = await hierarchy.unsealProfileForSystem(sealed, systemKey);
    expect(recovered.equals(profileKey)).toBe(true);
  });

  it('is idempotent: a second ensure keeps the same public key', async () => {
    const systemKey = crypto.generateDataKey();
    const first = await hierarchy.ensureSystemReadKey(systemKey);
    const second = await hierarchy.ensureSystemReadKey(systemKey);
    expect(second).toBe(first);
    expect(prisma.update).toHaveBeenCalledTimes(1);
  });

  it('does not recover the profile key with a different System KEK', async () => {
    const systemKey = crypto.generateDataKey();
    const profileKey = crypto.generateDataKey();
    const publicKey = await hierarchy.ensureSystemReadKey(systemKey);
    const sealed = hierarchy.sealProfileForSystem(profileKey, publicKey);

    const wrongKey = crypto.generateDataKey();
    await expect(hierarchy.unsealProfileForSystem(sealed, wrongKey)).rejects.toThrow();
  });
});
