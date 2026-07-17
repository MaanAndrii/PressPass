import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { PositionsService } from './positions.service';

describe('PositionsService', () => {
  let service: PositionsService;

  const prismaMock = {
    position: { findUnique: jest.fn(), delete: jest.fn() },
    card: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [PositionsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(PositionsService);
  });

  it('refuses to delete a position used by an issued card', async () => {
    prismaMock.position.findUnique.mockResolvedValue({ id: 1, nameUk: 'Кореспондент', nameEn: '' });
    prismaMock.card.count.mockResolvedValue(2);

    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.position.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused position', async () => {
    prismaMock.position.findUnique.mockResolvedValue({ id: 1, nameUk: 'Стажер', nameEn: '' });
    prismaMock.card.count.mockResolvedValue(0);
    prismaMock.position.delete.mockResolvedValue({});

    await expect(service.remove(1)).resolves.toEqual({ success: true });
    expect(prismaMock.position.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
