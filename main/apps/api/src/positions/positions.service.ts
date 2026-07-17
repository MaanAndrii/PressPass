import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Position } from '@presspass/shared';

import { PrismaService } from '../prisma/prisma.service';
import type { CreatePositionDto } from './dto/create-position.dto';

/** Catalogue of journalist positions (Ukrainian + English). */
@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Position[]> {
    return this.prisma.position.findMany({ orderBy: { nameUk: 'asc' } });
  }

  create(dto: CreatePositionDto): Promise<Position> {
    return this.prisma.position.create({
      data: { nameUk: dto.nameUk.trim(), nameEn: dto.nameEn?.trim() ?? '' },
    });
  }

  async update(id: number, dto: CreatePositionDto): Promise<Position> {
    await this.ensureExists(id);
    return this.prisma.position.update({
      where: { id },
      data: { nameUk: dto.nameUk.trim(), nameEn: dto.nameEn?.trim() ?? '' },
    });
  }

  async remove(id: number): Promise<{ success: boolean }> {
    const position = await this.ensureExists(id);
    // Cards store the position as text (set at issuance); refuse to delete a
    // catalogue entry that is still used by an issued card.
    const used = await this.prisma.card.count({ where: { position: position.nameUk } });
    if (used > 0) {
      throw new ConflictException(
        `Посаду «${position.nameUk}» використовують ${used} посвідч. — видалити не можна`,
      );
    }
    await this.prisma.position.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: number) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    return position;
  }
}
