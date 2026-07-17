import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/auth.types';

import { PrismaService } from '../prisma/prisma.service';
import { EditorialsService } from './editorials.service';

describe('EditorialsService', () => {
  let service: EditorialsService;

  const prismaMock = {
    editorial: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    editorialMembership: { count: jest.fn().mockResolvedValue(0) },
  };

  const superAdmin: JwtPayload = { sub: 1, email: 'a@x', role: 'ADMIN', editorialId: null };

  const row = {
    id: 1,
    name: 'Онлайн-медіа «Приклад»',
    displayNameUk: '',
    displayNameEn: '',
    mediaId: '',
    edrpou: '12345678',
    website: 'https://pryklad.media/registry',
    logoPath: null,
    director: 'Директор',
    email: 'a@b.ua',
    address: 'Київ',
    phone: '+380441234567',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [EditorialsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(EditorialsService);
  });

  it('maps a created editorial to the API shape (no timestamps)', async () => {
    prismaMock.editorial.create.mockResolvedValue(row);

    const result = await service.create({ name: row.name, edrpou: row.edrpou });

    expect(result).toEqual({
      id: 1,
      name: row.name,
      displayNameUk: '',
      displayNameEn: '',
      mediaId: '',
      edrpou: row.edrpou,
      website: row.website,
      logoPath: null,
      director: row.director,
      email: row.email,
      address: row.address,
      phone: row.phone,
    });
    // Optional fields absent from the DTO default to empty strings.
    expect(prismaMock.editorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: row.name, edrpou: row.edrpou, website: '' }),
    });
  });

  it('refuses to delete an editorial that still has journalists', async () => {
    prismaMock.editorial.findUnique.mockResolvedValue(row);
    prismaMock.editorialMembership.count.mockResolvedValueOnce(3);

    await expect(service.remove(1)).rejects.toThrow(/журналіст/);
    expect(prismaMock.editorial.delete).not.toHaveBeenCalled();
  });

  it('rejects updates/logo/removal for a missing editorial', async () => {
    prismaMock.editorial.findUnique.mockResolvedValue(null);

    await expect(service.update(99, { name: 'x' }, superAdmin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setLogo(99, '/uploads/branding/x.png', superAdmin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.editorial.update).not.toHaveBeenCalled();
    expect(prismaMock.editorial.delete).not.toHaveBeenCalled();
  });

  it('stores the uploaded logo path', async () => {
    prismaMock.editorial.findUnique.mockResolvedValue(row);
    prismaMock.editorial.update.mockResolvedValue({ ...row, logoPath: '/uploads/branding/x.png' });

    const result = await service.setLogo(1, '/uploads/branding/x.png', superAdmin);

    expect(result.logoPath).toBe('/uploads/branding/x.png');
    expect(prismaMock.editorial.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { logoPath: '/uploads/branding/x.png' },
    });
  });
});
