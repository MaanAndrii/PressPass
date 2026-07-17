import { Test } from '@nestjs/testing';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminsService } from './admins.service';

describe('AdminsService', () => {
  const prismaMock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    editorial: { findUnique: jest.fn() },
  };
  const userKeysMock = { provision: jest.fn() };
  let service: AdminsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UserKeyMaterialService, useValue: userKeysMock },
      ],
    }).compile();
    service = moduleRef.get(AdminsService);
  });

  it('atomically provisions password key material for a new administrator', async () => {
    const createdAt = new Date();
    const created = {
      id: 10,
      email: 'admin@example.com',
      role: 'ADMIN',
      editorialId: null,
      createdAt,
    };
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(created);
    prismaMock.user.update.mockResolvedValue(created);
    userKeysMock.provision.mockResolvedValue({
      passwordKdf: { version: 1 },
      dataKeyEnvelope: { version: 1 },
    });

    await service.create({
      email: 'ADMIN@example.com',
      password: 'password-123',
      role: 'ADMIN',
    });

    expect(userKeysMock.provision).toHaveBeenCalledWith(created.id, 'password-123');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: created.id },
      data: { passwordKdf: { version: 1 }, dataKeyEnvelope: { version: 1 } },
    });
  });
});
