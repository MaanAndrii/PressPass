import { EditorialKeyGrantService } from './editorial-key-grant.service';

describe('EditorialKeyGrantService', () => {
  const grantStore = {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  };
  const prisma = {
    editorialDataKeyGrant: grantStore,
    $transaction: jest.fn((callback) => callback({ editorialDataKeyGrant: grantStore })),
  };
  const userKeys = {
    createEditorialGrant: jest.fn((userId, editorialId) => ({
      version: 1,
      ciphertext: `${userId}:${editorialId}`,
    })),
  };
  const service = new EditorialKeyGrantService(prisma as never, userKeys as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates one encrypted grant for every unique editorial membership', async () => {
    await service.sync(7, [3, 5, 3], Buffer.alloc(32, 9));

    expect(grantStore.upsert).toHaveBeenCalledTimes(2);
    expect(grantStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_editorialId: { userId: 7, editorialId: 3 } } }),
    );
    expect(grantStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_editorialId: { userId: 7, editorialId: 5 } } }),
    );
    expect(grantStore.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, editorialId: { notIn: [3, 5] } },
    });
  });

  it('removes every grant when the user has no editorial memberships', async () => {
    await service.sync(7, [], Buffer.alloc(32, 9));

    expect(grantStore.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(grantStore.upsert).not.toHaveBeenCalled();
  });
});
