import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Editorial } from '@presspass/shared';

import type { JwtPayload } from '../auth/auth.types';
import { mapEditorial } from '../common/editorial.mapper';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEditorialDto } from './dto/create-editorial.dto';
import type { UpdateEditorialDto } from './dto/update-editorial.dto';

/** CRUD for issuing companies ("редакції"). */
@Injectable()
export class EditorialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** System admins see all; an editorial admin sees only their own editorial. */
  async findAll(actor: JwtPayload): Promise<Editorial[]> {
    const editorials = await this.prisma.editorial.findMany({
      where: actor.role === 'EDITORIAL_ADMIN' ? { id: actor.editorialId ?? -1 } : undefined,
      orderBy: { name: 'asc' },
    });
    return editorials.map(mapEditorial);
  }

  async create(dto: CreateEditorialDto): Promise<Editorial> {
    const cardNumberPrefix = dto.cardNumberPrefix?.trim().toUpperCase() ?? '';
    await this.assertPrefixFree(cardNumberPrefix, null);
    const editorial = await this.prisma.editorial.create({
      data: {
        name: dto.name.trim(),
        displayNameUk: dto.displayNameUk ?? '',
        displayNameEn: dto.displayNameEn ?? '',
        mediaId: dto.mediaId?.toUpperCase() ?? '',
        edrpou: dto.edrpou ?? '',
        website: dto.website ?? '',
        director: dto.director ?? '',
        email: dto.email ?? '',
        address: dto.address ?? '',
        phone: dto.phone ?? '',
        cardNumberPrefix,
        ...(dto.cardNumberTemplate?.trim()
          ? { cardNumberTemplate: dto.cardNumberTemplate.trim() }
          : {}),
      },
    });
    return mapEditorial(editorial);
  }

  async update(id: number, dto: UpdateEditorialDto, actor: JwtPayload): Promise<Editorial> {
    this.assertManages(id, actor);
    await this.ensureExists(id);
    const cardNumberPrefix =
      dto.cardNumberPrefix !== undefined ? dto.cardNumberPrefix.trim().toUpperCase() : undefined;
    if (cardNumberPrefix !== undefined) {
      await this.assertPrefixFree(cardNumberPrefix, id);
    }
    const editorial = await this.prisma.editorial.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        displayNameUk: dto.displayNameUk,
        displayNameEn: dto.displayNameEn,
        mediaId: dto.mediaId?.toUpperCase(),
        edrpou: dto.edrpou,
        website: dto.website,
        director: dto.director,
        email: dto.email,
        address: dto.address,
        phone: dto.phone,
        cardNumberPrefix,
        cardNumberTemplate: dto.cardNumberTemplate?.trim() || undefined,
      },
    });
    return mapEditorial(editorial);
  }

  /** A non-empty number prefix must be unique across editorials. */
  private async assertPrefixFree(prefix: string, selfId: number | null): Promise<void> {
    if (!prefix) {
      return;
    }
    const owner = await this.prisma.editorial.findFirst({ where: { cardNumberPrefix: prefix } });
    if (owner && owner.id !== selfId) {
      throw new ConflictException(`Префікс «${prefix}» уже використовує інша редакція`);
    }
  }

  /** Removes the editorial; issued cards keep their history (editorial_id → NULL). */
  async remove(id: number): Promise<{ success: boolean }> {
    await this.ensureExists(id);
    const journalists = await this.prisma.editorialMembership.count({ where: { editorialId: id } });
    if (journalists > 0) {
      throw new ConflictException(
        `У редакції ${journalists} журналіст(ів) — спершу приберіть їх, тоді видаляйте`,
      );
    }
    await this.prisma.editorial.delete({ where: { id } });
    return { success: true };
  }

  /** Stores the uploaded logo path (files live on disk, not in PostgreSQL). */
  async setLogo(id: number, logoPath: string, actor: JwtPayload): Promise<Editorial> {
    this.assertManages(id, actor);
    await this.ensureExists(id);
    const editorial = await this.prisma.editorial.update({ where: { id }, data: { logoPath } });
    return mapEditorial(editorial);
  }

  /** An editorial admin may only touch their own editorial. */
  private assertManages(id: number, actor: JwtPayload): void {
    if (actor.role === 'EDITORIAL_ADMIN' && actor.editorialId !== id) {
      throw new ForbiddenException('Можна редагувати лише власну редакцію');
    }
  }

  private async ensureExists(id: number) {
    const editorial = await this.prisma.editorial.findUnique({ where: { id } });
    if (!editorial) {
      throw new NotFoundException('Editorial not found');
    }
    return editorial;
  }
}
