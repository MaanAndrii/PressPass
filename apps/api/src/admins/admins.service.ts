import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminAccount } from '@presspass/shared';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import type { JwtPayload } from '../auth/auth.types';
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
    private readonly blindIndexes: BlindIndexService,
    private readonly hierarchy: KeyHierarchyService,
    private readonly sessions: UnlockSessionService,
  ) {}

  async findAll(actor?: JwtPayload, unlock?: string): Promise<AdminAccount[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { editorial: { select: { name: true } } },
    });
    // A Superadmin holds the System KEK, so their session can decrypt every
    // admin's email via the system read key. Without it, the hashed column stays.
    let systemKey: Buffer | undefined;
    if (actor?.role === 'ADMIN' && unlock) {
      try {
        systemKey = this.sessions.key(unlock, actor.sub, 'system');
      } catch {
        systemKey = undefined;
      }
    }
    try {
      return await Promise.all(
        admins.map(async (a) => {
          let email = a.email;
          if (systemKey && a.encryptedData && a.systemKeyEnvelope) {
            try {
              const profile = await this.hierarchy.unsealProfileForSystem(
                a.systemKeyEnvelope,
                systemKey,
              );
              try {
                email = this.userKeys.decryptUserData<{ email: string }>(
                  a.id,
                  a.encryptedData,
                  profile,
                ).email;
              } finally {
                profile.fill(0);
              }
            } catch {
              // Not yet sealed for the system key — keep the hashed value.
            }
          }
          return {
            id: a.id,
            email,
            emailVerified: Boolean(a.emailVerifiedAt),
            role: a.role,
            editorialId: a.editorialId,
            editorialName: a.editorial?.name ?? null,
            createdAt: a.createdAt.toISOString(),
          };
        }),
      );
    } finally {
      systemKey?.fill(0);
    }
  }

  /** Creates a system (ADMIN) or editorial-bound (EDITORIAL_ADMIN) administrator. */
  async create(
    dto: CreateAdminDto,
    actor: JwtPayload,
    unlockToken?: string,
  ): Promise<AdminAccount> {
    const email = this.blindIndexes.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ emailBlindIndex: this.blindIndexes.email(email) }, { email }] },
    });
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
          email: this.blindIndexes.email(email),
          emailBlindIndex: this.blindIndexes.email(email),
          passwordHash,
          role,
          emailVerifiedAt: new Date(),
          // System admins are not bound to any editorial.
          editorialId: role === 'EDITORIAL_ADMIN' ? dto.editorialId : null,
        },
      });
      let systemSeal: Prisma.InputJsonValue | undefined;
      const keyMaterial = await this.userKeys.provision(
        created.id,
        dto.password,
        { email },
        async (key) => {
          await this.hierarchy.wrapOwnerForRecovery('user', String(created.id), key, tx);
          const publicKey = await this.hierarchy.getSystemReadPublicKey();
          if (publicKey) systemSeal = this.hierarchy.sealProfileForSystem(key, publicKey);
        },
      );
      return tx.user.update({
        where: { id: created.id },
        data: {
          ...keyMaterial,
          email: this.blindIndexes.email(email),
          ...(systemSeal ? { systemKeyEnvelope: systemSeal } : {}),
        },
      });
    });
    const newAdminKey = await this.hierarchy.enrollAdmin(admin.id, dto.encryptionPassphrase);
    try {
      if (role === 'ADMIN') {
        if (!unlockToken) throw new BadRequestException('Encryption unlock required');
        let systemKey: Buffer;
        try {
          systemKey = this.sessions.key(unlockToken, actor.sub, 'system');
        } catch {
          throw new BadRequestException('Encryption unlock required');
        }
        try {
          await this.hierarchy.grantSystemToAdmin(admin.id, systemKey, newAdminKey);
        } finally {
          systemKey.fill(0);
        }
        for (const editorial of await this.prisma.editorial.findMany({ select: { id: true } })) {
          let editorialKey: Buffer;
          try {
            editorialKey = this.sessions.key(unlockToken, actor.sub, `editorial:${editorial.id}`);
          } catch {
            throw new BadRequestException(
              `Editorial ${editorial.id} must be unlocked before granting the new Superadmin`,
            );
          }
          try {
            await this.hierarchy.grantEditorialToAdmin(
              editorial.id,
              admin.id,
              editorialKey,
              newAdminKey,
            );
          } finally {
            editorialKey.fill(0);
          }
        }
      }
      if (role === 'EDITORIAL_ADMIN' && dto.editorialId) {
        if (!unlockToken) throw new BadRequestException('Encryption unlock required');
        let editorialKey: Buffer;
        try {
          editorialKey = this.sessions.key(unlockToken, actor.sub, `editorial:${dto.editorialId}`);
        } catch {
          throw new BadRequestException('Encryption unlock required');
        }
        try {
          await this.hierarchy.grantEditorialToAdmin(
            dto.editorialId,
            admin.id,
            editorialKey,
            newAdminKey,
          );
        } finally {
          editorialKey.fill(0);
        }
      }
    } finally {
      newAdminKey.fill(0);
    }
    return {
      id: admin.id,
      email,
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
