import { Test } from '@nestjs/testing';

import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PrismaService } from '../prisma/prisma.service';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const prisma: any = {
    editorialMembership: { findMany: jest.fn(), delete: jest.fn() },
    user: { findMany: jest.fn(), delete: jest.fn() },
  };
  const files = { removeOwner: jest.fn().mockResolvedValue(undefined) };
  const grants = { revoke: jest.fn().mockResolvedValue({ count: 1 }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptedFileService, useValue: files },
        { provide: EditorialKeyGrantService, useValue: grants },
      ],
    }).compile();
    service = moduleRef.get(MaintenanceService);
  });

  it('purges accounts and memberships past the grace window and revokes their grants', async () => {
    prisma.editorialMembership.findMany.mockResolvedValue([
      { id: 5, editorialId: 3, journalist: { userId: 9 } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 9 }, { id: 12 }]);
    prisma.editorialMembership.delete.mockResolvedValue({});
    prisma.user.delete.mockResolvedValue({});

    const result = await service.purgeExpiredSoftDeletes();

    expect(result).toEqual({ accounts: 2, memberships: 1 });
    // Only tombstones older than the cutoff are selected.
    const membershipWhere = prisma.editorialMembership.findMany.mock.calls[0][0].where;
    expect(membershipWhere.deletedAt.not).toBeNull();
    expect(membershipWhere.deletedAt.lt).toBeInstanceOf(Date);
    // Membership purge revokes the editorial grant, then deletes the row.
    expect(grants.revoke).toHaveBeenCalledWith(9, 3);
    expect(prisma.editorialMembership.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    // Account purge removes owned files, then cascades via the user delete.
    expect(files.removeOwner).toHaveBeenCalledWith('user', '9');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it('does nothing when there is nothing to purge', async () => {
    prisma.editorialMembership.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.purgeExpiredSoftDeletes()).resolves.toEqual({
      accounts: 0,
      memberships: 0,
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
