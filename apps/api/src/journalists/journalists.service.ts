import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isProfileComplete, type AdminJournalist, type Role } from '@presspass/shared';
import * as argon2 from 'argon2';
import type { Editorial, EditorialMembership, Journalist, Prisma, User } from '@prisma/client';

import type { JwtPayload } from '../auth/auth.types';
import { toIsoDate } from '../common/card.mapper';
import { generateJournalistPublicId, normalizePublicId } from '../common/public-id';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { EditorialKeyGrantService } from '../crypto/editorial-key-grant.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AttachJournalistDto } from './dto/attach-journalist.dto';
import type { CreateJournalistDto } from './dto/create-journalist.dto';
import type { UpdateJournalistDto } from './dto/update-journalist.dto';

type JournalistWithUser = Journalist & {
  user: User;
  _count: { cards: number };
  memberships: (EditorialMembership & { editorial: Editorial })[];
};

const ADMIN_INCLUDE = {
  user: true,
  _count: { select: { cards: true } },
  memberships: { include: { editorial: true } },
} as const;

@Injectable()
export class JournalistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly editorialGrants: EditorialKeyGrantService,
  ) {}

  /**
   * System admins see every journalist; an editorial admin sees ONLY the
   * journalists who are members of their own editorial — self-registered and
   * other editorials' journalists stay private.
   */
  async findAll(actor: JwtPayload): Promise<AdminJournalist[]> {
    const journalists = await this.prisma.journalist.findMany({
      where:
        actor.role === 'EDITORIAL_ADMIN'
          ? { memberships: { some: { editorialId: actor.editorialId ?? -1 } } }
          : undefined,
      include: ADMIN_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return journalists.map((journalist) => this.toAdminDto(journalist));
  }

  async create(dto: CreateJournalistDto, actor: JwtPayload): Promise<AdminJournalist> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const journalist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.journalist.create({
        data: {
          publicId: generateJournalistPublicId(),
          fullName: dto.fullName,
          fullNameEn: dto.fullNameEn ?? '',
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          passportData: dto.passportData ?? undefined,
          taxNumber: dto.taxNumber ?? undefined,
          phone: dto.phone ?? undefined,
          nszhuMember: dto.nszhuMember ?? undefined,
          user: {
            create: {
              email,
              passwordHash,
              role: 'JOURNALIST' as Role,
              // Створені адміністратором акаунти не потребують підтвердження email.
              emailVerifiedAt: new Date(),
            },
          },
          // An editorial admin's new journalist automatically joins their media.
          ...(actor.role === 'EDITORIAL_ADMIN' && actor.editorialId
            ? { memberships: { create: { editorialId: actor.editorialId } } }
            : {}),
        },
        include: ADMIN_INCLUDE,
      });
      const keyMaterial = await this.userKeys.provision(created.userId, dto.password);
      await tx.user.update({ where: { id: created.userId }, data: keyMaterial });
      return created;
    });
    if (journalist.memberships.length > 0) {
      await this.editorialGrants.syncFromRecovery(journalist.userId);
    }
    return this.toAdminDto(journalist);
  }

  /**
   * Adds an existing journalist to a media by their public id. An editorial
   * admin adds to their own editorial; a system admin passes the target one.
   */
  async attach(dto: AttachJournalistDto, actor: JwtPayload): Promise<AdminJournalist> {
    const editorialId =
      actor.role === 'EDITORIAL_ADMIN' ? (actor.editorialId ?? undefined) : dto.editorialId;
    if (!editorialId) {
      throw new BadRequestException('Виберіть редакцію, до якої додати журналіста');
    }
    const editorial = await this.prisma.editorial.findUnique({ where: { id: editorialId } });
    if (!editorial) {
      throw new NotFoundException('Editorial not found');
    }
    const journalist = await this.prisma.journalist.findUnique({
      where: { publicId: normalizePublicId(dto.publicId) },
    });
    if (!journalist) {
      throw new NotFoundException('Журналіста з таким ID не знайдено');
    }
    // Idempotent: adding an already-linked journalist is a no-op, not an error.
    await this.prisma.editorialMembership.upsert({
      where: { editorialId_journalistId: { editorialId, journalistId: journalist.id } },
      update: {},
      create: { editorialId, journalistId: journalist.id },
    });
    await this.editorialGrants.syncFromRecovery(journalist.userId);
    return this.toAdminDto(await this.loadForAdmin(journalist.id));
  }

  /** Removes a journalist from the editorial admin's own media (not the account). */
  async detach(id: number, actor: JwtPayload): Promise<AdminJournalist> {
    if (actor.role !== 'EDITORIAL_ADMIN' || !actor.editorialId) {
      throw new ForbiddenException('Прибрати з редакції може лише редакційний адміністратор');
    }
    await this.prisma.editorialMembership.deleteMany({
      where: { journalistId: id, editorialId: actor.editorialId },
    });
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (journalist) {
      await this.editorialGrants.revoke(journalist.userId, actor.editorialId);
    }
    return this.toAdminDto(await this.loadForAdmin(id));
  }

  async update(id: number, dto: UpdateJournalistDto, actor: JwtPayload): Promise<AdminJournalist> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (!journalist) {
      throw new NotFoundException('Journalist not found');
    }
    await this.assertManages(id, actor);

    const userData: Prisma.UserUpdateInput = {};
    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const emailOwner = await this.prisma.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== journalist.userId) {
        throw new ConflictException('A user with this email already exists');
      }
      userData.email = email;
    }
    if (dto.password) {
      userData.passwordHash = await argon2.hash(dto.password);
      const account = await this.prisma.user.findUnique({ where: { id: journalist.userId } });
      const keyMaterial = account?.recoveryKeyEnvelope
        ? await this.userKeys.resetWithRecovery(
            journalist.userId,
            dto.password,
            account.recoveryKeyEnvelope,
          )
        : await this.userKeys.provision(journalist.userId, dto.password);
      Object.assign(userData, keyMaterial, { tokenVersion: { increment: 1 } });
    }

    const updated = await this.prisma.journalist.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        fullNameEn: dto.fullNameEn,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        passportData: dto.passportData,
        taxNumber: dto.taxNumber,
        phone: dto.phone,
        nszhuMember: dto.nszhuMember,
        ...(Object.keys(userData).length > 0 ? { user: { update: userData } } : {}),
      },
      include: ADMIN_INCLUDE,
    });
    return this.toAdminDto(updated);
  }

  /** Deletes the journalist together with the login account and all cards (cascade). */
  async remove(id: number): Promise<{ success: boolean }> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (!journalist) {
      throw new NotFoundException('Journalist not found');
    }
    await this.prisma.user.delete({ where: { id: journalist.userId } });
    return { success: true };
  }

  /** Stores the uploaded photo path (files live on disk, not in PostgreSQL). */
  async setPhoto(id: number, photoPath: string, actor: JwtPayload): Promise<AdminJournalist> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (!journalist) {
      throw new NotFoundException('Journalist not found');
    }
    await this.assertManages(id, actor);
    const updated = await this.prisma.journalist.update({
      where: { id },
      data: { photoPath },
      include: ADMIN_INCLUDE,
    });
    return this.toAdminDto(updated);
  }

  /** An editorial admin may only act on journalists who are their members. */
  private async assertManages(id: number, actor: JwtPayload): Promise<void> {
    if (actor.role !== 'EDITORIAL_ADMIN') {
      return;
    }
    const member = await this.prisma.editorialMembership.findUnique({
      where: {
        editorialId_journalistId: { editorialId: actor.editorialId ?? -1, journalistId: id },
      },
    });
    if (!member) {
      throw new ForbiddenException('Цей журналіст не належить до вашої редакції');
    }
  }

  private loadForAdmin(id: number): Promise<JournalistWithUser> {
    return this.prisma.journalist.findUniqueOrThrow({ where: { id }, include: ADMIN_INCLUDE });
  }

  private toAdminDto(journalist: JournalistWithUser): AdminJournalist {
    return {
      id: journalist.id,
      userId: journalist.userId,
      publicId: journalist.publicId,
      email: journalist.user.email,
      emailVerified: Boolean(journalist.user.emailVerifiedAt),
      fullName: journalist.fullName,
      fullNameEn: journalist.fullNameEn,
      position: journalist.position,
      positionEn: journalist.positionEn,
      organization: journalist.organization,
      organizationEn: journalist.organizationEn,
      photoPath: journalist.photoPath,
      birthDate: journalist.birthDate ? toIsoDate(journalist.birthDate) : null,
      passportData: journalist.passportData,
      taxNumber: journalist.taxNumber,
      phone: journalist.phone,
      nszhuMember: journalist.nszhuMember,
      selfRegistered: journalist.selfRegistered,
      profileComplete: isProfileComplete(journalist),
      cardsCount: journalist._count.cards,
      memberships: journalist.memberships.map((m) => ({
        id: m.editorial.id,
        name: m.editorial.name,
      })),
    };
  }
}
