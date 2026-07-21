import { Injectable, NotFoundException } from '@nestjs/common';
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
    await this.ensureExists(id);
    // A card snapshots its position text (in its encrypted payload) at issuance,
    // so deleting a catalogue entry never affects already-issued credentials and
    // the encrypted position cannot be queried here.
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
