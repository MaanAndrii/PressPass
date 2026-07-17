import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { JwtPayload } from '../auth/auth.types';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import { JournalistsService } from './journalists.service';

describe('JournalistsService', () => {
  let service: JournalistsService;

  const prismaMock = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    journalist: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    editorial: { findUnique: jest.fn() },
    editorialMembership: { upsert: jest.fn() },
  };
  const userKeysMock = { provision: jest.fn() };
  const editorialGrantsMock = { revoke: jest.fn(), syncFromRecovery: jest.fn() };

  const superAdmin: JwtPayload = { sub: 1, email: 'a@x', role: 'ADMIN', editorialId: null };
  const edAdmin: JwtPayload = { sub: 9, email: 'e@x', role: 'EDITORIAL_ADMIN', editorialId: 5 };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.journalist.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalistsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UserKeyMaterialService, useValue: userKeysMock },
        { provide: EditorialKeyGrantService, useValue: editorialGrantsMock },
      ],
    }).compile();
    service = moduleRef.get(JournalistsService);
  });

  it('shows a system admin every journalist (no filter)', async () => {
    await service.findAll(superAdmin);
    expect(prismaMock.journalist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('shows an editorial admin only their own members', async () => {
    await service.findAll(edAdmin);
    expect(prismaMock.journalist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberships: { some: { editorialId: 5 } } },
      }),
    );
  });

  it('attaches a journalist to the editorial admin’s media by public id', async () => {
    prismaMock.editorial.findUnique.mockResolvedValue({ id: 5, name: 'Media' });
    prismaMock.journalist.findUnique.mockResolvedValue({ id: 42, publicId: 'JR-ABC234' });
    prismaMock.journalist.findUniqueOrThrow.mockResolvedValue({
      id: 42,
      userId: 7,
      publicId: 'JR-ABC234',
      fullName: 'X',
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
      user: { email: 'x@x', emailVerifiedAt: new Date() },
      _count: { cards: 0 },
      memberships: [{ editorial: { id: 5, name: 'Media' } }],
    });

    // Lower-case input is normalised to the JR- code before lookup.
    const result = await service.attach({ publicId: 'jr-abc234' }, edAdmin);

    expect(prismaMock.journalist.findUnique).toHaveBeenCalledWith({
      where: { publicId: 'JR-ABC234' },
    });
    expect(prismaMock.editorialMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { editorialId: 5, journalistId: 42 },
      }),
    );
    expect(result.memberships).toEqual([{ id: 5, name: 'Media' }]);
  });

  it('rejects an unknown public id', async () => {
    prismaMock.editorial.findUnique.mockResolvedValue({ id: 5, name: 'Media' });
    prismaMock.journalist.findUnique.mockResolvedValue(null);
    await expect(service.attach({ publicId: 'JR-ZZZZZZ' }, edAdmin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('provisions password key material when an administrator creates a journalist', async () => {
    const created = journalistRecord();
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.journalist.create.mockResolvedValue(created);
    userKeysMock.provision.mockResolvedValue({
      passwordKdf: { version: 1 },
      dataKeyEnvelope: { version: 1 },
    });

    await service.create(
      { email: 'NEW@EXAMPLE.COM', password: 'password-123', fullName: 'Test User' },
      superAdmin,
    );

    expect(userKeysMock.provision).toHaveBeenCalledWith(created.userId, 'password-123');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: created.userId },
      data: { passwordKdf: { version: 1 }, dataKeyEnvelope: { version: 1 } },
    });
  });

  it('rotates password key material on an administrative password reset', async () => {
    const existing = journalistRecord();
    prismaMock.journalist.findUnique.mockResolvedValue({
      id: existing.id,
      userId: existing.userId,
    });
    prismaMock.journalist.update.mockResolvedValue(existing);
    userKeysMock.provision.mockResolvedValue({
      passwordKdf: { version: 1, salt: 'new' },
      dataKeyEnvelope: { version: 1, ciphertext: 'new' },
    });

    await service.update(existing.id, { password: 'replacement-123' }, superAdmin);

    expect(userKeysMock.provision).toHaveBeenCalledWith(existing.userId, 'replacement-123');
    expect(prismaMock.journalist.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: {
            update: expect.objectContaining({
              passwordHash: expect.any(String),
              passwordKdf: { version: 1, salt: 'new' },
              dataKeyEnvelope: { version: 1, ciphertext: 'new' },
            }),
          },
        }),
      }),
    );
  });

  function journalistRecord() {
    return {
      id: 42,
      userId: 7,
      publicId: 'JR-ABC234',
      fullName: 'Test User',
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
      selfRegistered: false,
      user: { email: 'new@example.com', emailVerifiedAt: new Date() },
      _count: { cards: 0 },
      memberships: [],
    };
  }
});
