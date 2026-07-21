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

  // A card snapshots its position text into its encrypted payload at issuance,
  // so the catalogue entry can always be deleted (and the encrypted position
  // cannot be queried to guard it).
  it('deletes a catalogue position without querying encrypted cards', async () => {
    prismaMock.position.findUnique.mockResolvedValue({ id: 1, nameUk: 'Стажер', nameEn: '' });
    prismaMock.position.delete.mockResolvedValue({});

    await expect(service.remove(1)).resolves.toEqual({ success: true });
    expect(prismaMock.position.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(prismaMock.card.count).not.toHaveBeenCalled();
  });
});
