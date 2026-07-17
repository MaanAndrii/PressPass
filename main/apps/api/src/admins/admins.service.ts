import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminAccount } from '@presspass/shared';
import * as argon2 from 'argon2';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdminDto } from './dto/create-admin.dto';

const ADMIN_ROLES = ['ADMIN', 'EDITORIAL_ADMIN'] as const;

/**
 * Manages administrator accounts. Only a system admin (ADMIN) may add or
 * remove editorial-bound admins (EDITORIAL_ADMIN); system admins themselves
 * are seeded/managed outside the app.
 */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeys: UserKeyMaterialService,
  ) {}

  async findAll(): Promise<AdminAccount[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { editorial: { select: { name: true } } },
    });
    return admins.map((a) => ({
      id: a.id,
      email: a.email,
      emailVerified: Boolean(a.emailVerifiedAt),
      role: a.role,
      editorialId: a.editorialId,
      editorialName: a.editorial?.name ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /** Creates a system (ADMIN) or editorial-bound (EDITORIAL_ADMIN) administrator. */
  async create(dto: CreateAdminDto): Promise<AdminAccount> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const role = dto.role ?? 'EDITORIAL_ADMIN';
    let editorialName: string | null = null;
    if (role === 'EDITORIAL_ADMIN') {
      if (!dto.editorialId) {
        throw new BadRequestException('editorialId is required for an editorial admin');
      }
      const editorial = await this.prisma.editorial.findUnique({ where: { id: dto.editorialId } });
      if (!editorial) {
        throw new NotFoundException('Editorial not found');
      }
      editorialName = editorial.name;
    }

    const passwordHash = await argon2.hash(dto.password);
    const admin = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          role,
          emailVerifiedAt: new Date(),
          // System admins are not bound to any editorial.
          editorialId: role === 'EDITORIAL_ADMIN' ? dto.editorialId : null,
        },
      });
      const keyMaterial = await this.userKeys.provision(created.id, dto.password);
      return tx.user.update({ where: { id: created.id }, data: keyMaterial });
    });
    return {
      id: admin.id,
      email: admin.email,
      emailVerified: true,
      role,
      editorialId: admin.editorialId,
      editorialName,
      createdAt: admin.createdAt.toISOString(),
    };
  }

  /**
   * Deletes an administrator (system or editorial). Guards against lockout:
   * an admin cannot delete their own account, and the last remaining system
   * administrator cannot be removed.
   */
  async remove(id: number, actorUserId: number): Promise<{ success: boolean }> {
    const admin = await this.prisma.user.findUnique({ where: { id } });
    if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'EDITORIAL_ADMIN')) {
      throw new NotFoundException('Administrator not found');
    }
    if (admin.id === actorUserId) {
      throw new BadRequestException('Не можна видалити власний обліковий запис');
    }
    if (admin.role === 'ADMIN') {
      const systemAdmins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (systemAdmins <= 1) {
        throw new ForbiddenException('Не можна видалити останнього системного адміністратора');
      }
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
