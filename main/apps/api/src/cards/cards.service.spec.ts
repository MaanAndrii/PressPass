import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/auth.types';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import { PrismaService } from '../prisma/prisma.service';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { QrTokenService } from '../qr/qr-token.service';
import { CardsService } from './cards.service';

describe('CardsService', () => {
  let service: CardsService;

  const prismaMock = {
    card: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    journalist: { findUnique: jest.fn() },
    editorial: { findUnique: jest.fn() },
    editorialMembership: { upsert: jest.fn() },
  };

  const journalist = {
    id: 1,
    userId: 2,
    publicId: 'JR-ABC234',
    fullName: 'Іван Петренко',
    photoPath: null,
  };
  const editorial = {
    id: 3,
    name: 'Онлайн-медіа «Приклад»',
    displayNameUk: '',
    displayNameEn: '',
    mediaId: '',
    cardNumberPrefix: '',
    cardNumberTemplate: '{prefix}-{year}-{seq:6}',
  };
  const superAdmin: JwtPayload = { sub: 1, email: 'a@x', role: 'ADMIN', editorialId: null };
  const edAdmin: JwtPayload = { sub: 9, email: 'e@x', role: 'EDITORIAL_ADMIN', editorialId: 3 };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.editorial.findUnique.mockResolvedValue(editorial);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://id.domain.ua') },
        },
        {
          provide: QrTokenService,
          useValue: { sign: jest.fn().mockResolvedValue('qr.token'), ttlSeconds: 60 },
        },
        {
          provide: EditorialKeyGrantService,
          useValue: { syncFromRecovery: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(CardsService);
  });

  const baseDto = {
    journalistId: 1,
    editorialId: 3,
    position: 'Кореспондент',
    expireDate: '2030-01-01',
  };

  describe('create', () => {
    it('issues a card with a server-generated UUIDv7 and verify URL', async () => {
      prismaMock.journalist.findUnique.mockResolvedValue(journalist);
      prismaMock.card.findUnique.mockResolvedValue(null);
      prismaMock.card.count.mockResolvedValue(0);
      prismaMock.card.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, journalist, editorial }),
      );

      const result = await service.create(baseDto, superAdmin);

      const createdData = prismaMock.card.create.mock.calls[0][0].data;
      expect(uuidValidate(createdData.uuid)).toBe(true);
      expect(uuidVersion(createdData.uuid)).toBe(7);
      expect(createdData.editorialId).toBe(3);
      expect(createdData.position).toBe('Кореспондент');
      expect(result.verifyUrl).toBe(`https://id.domain.ua/verify/${createdData.uuid}`);
      expect(result.status).toBe('ACTIVE');
    });

    it('numbers cards from the editorial template (per-editorial, per-year seq)', async () => {
      prismaMock.editorial.findUnique.mockResolvedValue({
        ...editorial,
        cardNumberPrefix: 'KV',
        cardNumberTemplate: '{prefix}-{year}-{seq:6}',
      });
      prismaMock.journalist.findUnique.mockResolvedValue(journalist);
      // No prior cards for this editorial/year, and the rendered number is free.
      prismaMock.card.findFirst.mockResolvedValue(null);
      prismaMock.card.findUnique.mockResolvedValue(null);
      prismaMock.card.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, journalist, editorial }),
      );

      const result = await service.create({ ...baseDto, issueDate: '2026-03-02' }, superAdmin);

      const createdData = prismaMock.card.create.mock.calls[0][0].data;
      expect(createdData.cardNumber).toBe('KV-2026-000001');
      expect(createdData.numberSeq).toBe(1);
      expect(result.cardNumber).toBe('KV-2026-000001');
    });

    it('forces an editorial admin to issue for their own editorial', async () => {
      prismaMock.journalist.findUnique.mockResolvedValue(journalist);
      prismaMock.card.findUnique.mockResolvedValue(null);
      prismaMock.card.count.mockResolvedValue(0);
      prismaMock.card.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, journalist, editorial }),
      );

      // Even if a different editorialId is sent, the actor's own is used.
      await service.create({ ...baseDto, editorialId: 999 }, edAdmin);

      expect(prismaMock.card.create.mock.calls[0][0].data.editorialId).toBe(3);
    });

    it('requires an editorial and a position', async () => {
      prismaMock.journalist.findUnique.mockResolvedValue(journalist);
      await expect(
        service.create({ journalistId: 1, position: 'X', expireDate: '2030-01-01' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ journalistId: 1, editorialId: 3, expireDate: '2030-01-01' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expireDate not after issueDate', async () => {
      prismaMock.journalist.findUnique.mockResolvedValue(journalist);
      await expect(
        service.create(
          { ...baseDto, issueDate: '2026-07-09', expireDate: '2026-07-09' },
          superAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown journalist', async () => {
      prismaMock.journalist.findUnique.mockResolvedValue(null);
      await expect(service.create({ ...baseDto, journalistId: 999 }, superAdmin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('block', () => {
    const stored = {
      id: 1,
      uuid: '018f0000-0000-7000-8000-000000000001',
      journalistId: 1,
      editorialId: 3,
      cardNumber: 'PP-2026-000001',
      issueDate: new Date('2026-01-01'),
      expireDate: new Date('2030-01-01'),
      status: 'ACTIVE',
    };

    it('sets status to BLOCKED', async () => {
      prismaMock.card.findUnique.mockResolvedValue(stored);
      prismaMock.card.update.mockResolvedValue({
        ...stored,
        status: 'BLOCKED',
        journalist,
        editorial,
      });

      const result = await service.block({ cardId: 1 }, superAdmin);

      expect(prismaMock.card.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { status: 'BLOCKED' } }),
      );
      expect(result.status).toBe('BLOCKED');
    });

    it('forbids an editorial admin from acting on another editorial’s card', async () => {
      prismaMock.card.findUnique.mockResolvedValue({ ...stored, editorialId: 7 });
      await expect(service.block({ cardId: 1 }, edAdmin)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.card.update).not.toHaveBeenCalled();
    });
  });

  describe('renew', () => {
    it('extends expiration and reactivates the card', async () => {
      const stored = {
        id: 1,
        uuid: '018f0000-0000-7000-8000-000000000001',
        journalistId: 1,
        editorialId: 3,
        cardNumber: 'PP-2026-000001',
        issueDate: new Date('2026-01-01'),
        expireDate: new Date('2026-06-01'),
        status: 'BLOCKED',
      };
      prismaMock.card.findUnique.mockResolvedValue(stored);
      prismaMock.card.update.mockResolvedValue({
        ...stored,
        expireDate: new Date('2030-01-01'),
        status: 'ACTIVE',
        journalist,
        editorial,
      });

      const result = await service.renew({ cardId: 1, expireDate: '2030-01-01' }, superAdmin);

      expect(result.status).toBe('ACTIVE');
      expect(result.expireDate).toBe('2030-01-01');
    });

    it('rejects a new expireDate before the issue date', async () => {
      prismaMock.card.findUnique.mockResolvedValue({
        id: 1,
        editorialId: 3,
        issueDate: new Date('2026-01-01'),
        expireDate: new Date('2027-01-01'),
        status: 'ACTIVE',
      });

      await expect(
        service.renew({ cardId: 1, expireDate: '2020-01-01' }, superAdmin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes a card the actor may manage', async () => {
      prismaMock.card.findUnique.mockResolvedValue({ id: 1, editorialId: 3 });
      prismaMock.card.delete.mockResolvedValue({ id: 1 });

      expect(await service.remove(1, edAdmin)).toEqual({ success: true });
      expect(prismaMock.card.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('forbids deleting another editorial’s card', async () => {
      prismaMock.card.findUnique.mockResolvedValue({ id: 1, editorialId: 7 });
      await expect(service.remove(1, edAdmin)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.card.delete).not.toHaveBeenCalled();
    });
  });
});
