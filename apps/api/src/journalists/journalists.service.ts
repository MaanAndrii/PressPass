import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isProfileComplete,
  type AdminJournalist,
  type AttachResult,
  type Role,
} from '@presspass/shared';
import * as argon2 from 'argon2';
import type { Editorial, EditorialMembership, Journalist, Prisma, User } from '@prisma/client';

import type { JwtPayload } from '../auth/auth.types';
import { toIsoDate } from '../common/card.mapper';
import type { JournalistSecret } from '../common/journalist.mapper';
import { generateJournalistPublicId, normalizePublicId } from '../common/public-id';
import { UserKeyMaterialService } from '../crypto/user-key-material.service';
import { BlindIndexService } from '../crypto/blind-index.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';
import { DomainPayloadService } from '../crypto/domain-payload.service';
import { KeyHierarchyService } from '../crypto/key-hierarchy.service';
import { EncryptedFileService } from '../crypto/encrypted-file.service';
import { PublicMediaCacheService } from '../crypto/public-media-cache.service';
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
  memberships: { where: { deletedAt: null }, include: { editorial: true } },
} as const;

@Injectable()
export class JournalistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly editorialGrants: EditorialKeyGrantService,
    private readonly blindIndexes: BlindIndexService,
    private readonly sessions: UnlockSessionService,
    private readonly payloads: DomainPayloadService,
    private readonly hierarchy: KeyHierarchyService,
    private readonly files: EncryptedFileService,
    private readonly publicMedia: PublicMediaCacheService,
  ) {}

  /**
   * System admins see every journalist; an editorial admin sees ONLY the
   * journalists who are members of their own editorial — self-registered and
   * other editorials' journalists stay private.
   */
  async findAll(actor: JwtPayload, unlock?: string): Promise<AdminJournalist[]> {
    const journalists = await this.prisma.journalist.findMany({
      where:
        actor.role === 'EDITORIAL_ADMIN'
          ? {
              user: { deletedAt: null },
              memberships: { some: { editorialId: actor.editorialId ?? -1, deletedAt: null } },
            }
          : { user: { deletedAt: null } },
      include: ADMIN_INCLUDE,
      orderBy: { id: 'asc' },
    });
    // A journalist the admin holds no key for (e.g. a self-registered one with
    // no editorial grant) must not break the whole list — list it redacted.
    return Promise.all(
      journalists.map((journalist) =>
        this.toAdminDto(journalist, actor, unlock).catch(() => this.redactedDto(journalist)),
      ),
    );
  }

  /** Minimal, non-decrypted entry for a journalist the admin cannot unlock. */
  private redactedDto(journalist: JournalistWithUser): AdminJournalist {
    return {
      id: journalist.id,
      userId: journalist.userId,
      publicId: journalist.publicId,
      email: '',
      emailVerified: Boolean(journalist.user.emailVerifiedAt),
      fullName: '',
      fullNameEn: '',
      position: '',
      positionEn: '',
      organization: '',
      organizationEn: '',
      photoPath: null,
      birthDate: null,
      passportData: null,
      taxNumber: null,
      phone: null,
      nszhuMember: false,
      selfRegistered: journalist.selfRegistered,
      profileComplete: false,
      cardsCount: journalist._count.cards,
      memberships: journalist.memberships.map((m) => ({
        id: m.editorial.id,
        name: m.editorial.publicName,
      })),
      encrypted: true,
    };
  }

  async create(
    dto: CreateJournalistDto,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AdminJournalist> {
    const email = this.blindIndexes.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findFirst({
      where: { emailBlindIndex: this.blindIndexes.email(email) },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    let capturedProfileKey: Buffer | undefined;
    const journalist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.journalist.create({
        data: {
          publicId: generateJournalistPublicId(),
          user: {
            create: {
              emailBlindIndex: this.blindIndexes.email(email),
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
      let systemSeal: Prisma.InputJsonValue | undefined;
      const keyMaterial = await this.userKeys.provision(
        created.userId,
        dto.password,
        { email },
        async (key) => {
          // Capture the freshly-provisioned profile DEK here: `created` was read
          // before this update, so its user key envelopes are still null and a
          // re-unlock would fail (and 500 after the row already committed).
          capturedProfileKey = Buffer.from(key);
          await this.hierarchy.wrapOwnerForRecovery('user', String(created.userId), key, tx);
          const publicKey = await this.hierarchy.getSystemReadPublicKey();
          if (publicKey) systemSeal = this.hierarchy.sealProfileForSystem(key, publicKey);
        },
      );
      await tx.user.update({
        where: { id: created.userId },
        data: {
          ...keyMaterial,
          ...(systemSeal ? { systemKeyEnvelope: systemSeal } : {}),
        },
      });
      return created;
    });
    if (!capturedProfileKey) throw new Error('Profile key was not provisioned');
    const profileKey = capturedProfileKey;
    try {
      const encryptedData = this.payloads.encrypt(
        'journalist',
        journalist.id,
        `user:${journalist.userId}`,
        this.profileData(dto),
        profileKey,
      );
      await this.prisma.journalist.update({
        where: { id: journalist.id },
        data: { encryptedData },
      });
      if (journalist.memberships.length && actor.editorialId) {
        const editorialKey = this.editorialKey(actor, unlock, actor.editorialId);
        try {
          await this.prisma.editorialDataKeyGrant.upsert({
            where: {
              userId_editorialId: { userId: journalist.userId, editorialId: actor.editorialId },
            },
            update: {
              keyEnvelope: this.hierarchy.wrapProfileForEditorial(
                journalist.userId,
                actor.editorialId,
                profileKey,
                editorialKey,
              ),
            },
            create: {
              userId: journalist.userId,
              editorialId: actor.editorialId,
              keyEnvelope: this.hierarchy.wrapProfileForEditorial(
                journalist.userId,
                actor.editorialId,
                profileKey,
                editorialKey,
              ),
            },
          });
        } finally {
          editorialKey.fill(0);
        }
      }
      return this.toAdminDto(await this.loadForAdmin(journalist.id), actor, unlock, profileKey);
    } finally {
      profileKey.fill(0);
    }
  }

  /**
   * Adds an existing journalist to a media by their public id. An editorial
   * admin adds to their own editorial; a system admin passes the target one.
   */
  async attach(
    dto: AttachJournalistDto,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AttachResult> {
    const editorialId =
      actor.role === 'EDITORIAL_ADMIN' ? (actor.editorialId ?? undefined) : dto.editorialId;
    if (!editorialId) {
      throw new BadRequestException('Виберіть редакцію, до якої додати журналіста');
    }
    const editorial = await this.prisma.editorial.findUnique({ where: { id: editorialId } });
    if (!editorial) {
      throw new NotFoundException('Editorial not found');
    }
    const found = await this.prisma.journalist.findUnique({
      where: { publicId: normalizePublicId(dto.publicId) },
      select: { id: true, user: { select: { deletedAt: true } } },
    });
    if (!found || found.user.deletedAt) {
      throw new NotFoundException('Журналіста з таким ID не знайдено');
    }
    const journalist = await this.loadForAdmin(found.id);

    const membership = await this.prisma.editorialMembership.findUnique({
      where: { editorialId_journalistId: { editorialId, journalistId: journalist.id } },
    });
    if (membership && !membership.deletedAt) {
      return { status: 'attached', journalist: await this.safeAdminDto(journalist, actor, unlock) };
    }
    // A membership removed within the grace window is reactivated instead of
    // creating a duplicate (the unique constraint would otherwise reject it).
    if (membership?.deletedAt) {
      await this.prisma.editorialMembership.update({
        where: { id: membership.id },
        data: { deletedAt: null },
      });
      return {
        status: 'attached',
        journalist: await this.safeAdminDto(await this.loadForAdmin(journalist.id), actor, unlock),
      };
    }

    // A Superadmin attaches directly; an editorial admin needs the journalist to
    // confirm, so we only create a PENDING request.
    if (actor.role === 'ADMIN') {
      await this.superadminAttach(journalist, editorialId, actor, unlock);
      return {
        status: 'attached',
        journalist: await this.safeAdminDto(await this.loadForAdmin(journalist.id), actor, unlock),
      };
    }
    await this.prisma.joinRequest.upsert({
      where: { editorialId_journalistId: { editorialId, journalistId: journalist.id } },
      update: { status: 'PENDING', respondedAt: null },
      create: { editorialId, journalistId: journalist.id, status: 'PENDING' },
    });
    return { status: 'pending', journalist: this.redactedDto(journalist) };
  }

  /** toAdminDto that degrades to a redacted row instead of throwing. */
  private async safeAdminDto(
    journalist: JournalistWithUser,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AdminJournalist> {
    return this.toAdminDto(journalist, actor, unlock).catch(() => this.redactedDto(journalist));
  }

  /** Superadmin direct attach: create membership and, best-effort, the grant. */
  private async superadminAttach(
    journalist: JournalistWithUser,
    editorialId: number,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<void> {
    await this.prisma.editorialMembership.create({
      data: { editorialId, journalistId: journalist.id },
    });
    if (!unlock || !journalist.user.systemKeyEnvelope) return;
    let systemKey: Buffer | undefined;
    let editorialKey: Buffer | undefined;
    let profileKey: Buffer | undefined;
    try {
      systemKey = this.sessions.key(unlock, actor.sub, 'system');
      editorialKey = this.sessions.key(unlock, actor.sub, `editorial:${editorialId}`);
      profileKey = await this.hierarchy.unsealProfileForSystem(
        journalist.user.systemKeyEnvelope,
        systemKey,
      );
      const keyEnvelope = this.hierarchy.wrapProfileForEditorial(
        journalist.userId,
        editorialId,
        profileKey,
        editorialKey,
      );
      await this.prisma.editorialDataKeyGrant.upsert({
        where: { userId_editorialId: { userId: journalist.userId, editorialId } },
        update: { keyEnvelope },
        create: { userId: journalist.userId, editorialId, keyEnvelope },
      });
    } catch {
      // No system/editorial key or unsealable profile — the grant is created on
      // the journalist's next login (login backfill) instead.
    } finally {
      systemKey?.fill(0);
      editorialKey?.fill(0);
      profileKey?.fill(0);
    }
  }

  /** Removes a journalist from the editorial admin's own media (not the account). */
  /** Editorial admin soft-removes a journalist from their OWN media. The
   *  credentials must be cancelled first (a credential must not outlive the
   *  membership), and the removal is undoable within the grace window via
   *  {@link restoreMembership}. The editorial key grant is kept meanwhile so an
   *  undo is lossless; the purge revokes it when the window elapses. */
  async detach(id: number, actor: JwtPayload, unlock?: string): Promise<AdminJournalist> {
    if (actor.role !== 'EDITORIAL_ADMIN' || !actor.editorialId) {
      throw new ForbiddenException('Прибрати з редакції може лише редакційний адміністратор');
    }
    const membership = await this.prisma.editorialMembership.findUnique({
      where: { editorialId_journalistId: { editorialId: actor.editorialId, journalistId: id } },
    });
    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Журналіст не є членом вашої редакції');
    }
    const activeCards = await this.prisma.card.count({
      where: { journalistId: id, editorialId: actor.editorialId, status: 'ACTIVE' },
    });
    if (activeCards > 0) {
      throw new ConflictException(
        'Спершу скасуйте (заблокуйте) активні посвідчення цього журналіста, тоді прибирайте його з редакції',
      );
    }
    await this.prisma.editorialMembership.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    });
    await this.prisma.joinRequest.deleteMany({
      where: { journalistId: id, editorialId: actor.editorialId },
    });
    // Access is gone from the list now — return a redacted row.
    return this.safeAdminDto(await this.loadForAdmin(id), actor, unlock);
  }

  /** Editorial admin undoes a detach within the grace window: the membership is
   *  reactivated (the grant was kept, so decryption access returns as well). */
  async restoreMembership(
    id: number,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AdminJournalist> {
    if (actor.role !== 'EDITORIAL_ADMIN' || !actor.editorialId) {
      throw new ForbiddenException('Відновити членство може лише редакційний адміністратор');
    }
    const membership = await this.prisma.editorialMembership.findUnique({
      where: { editorialId_journalistId: { editorialId: actor.editorialId, journalistId: id } },
    });
    if (!membership || !membership.deletedAt) {
      throw new NotFoundException('Немає нещодавно прибраного членства для відновлення');
    }
    await this.prisma.editorialMembership.update({
      where: { id: membership.id },
      data: { deletedAt: null },
    });
    return this.safeAdminDto(await this.loadForAdmin(id), actor, unlock);
  }

  async update(
    id: number,
    dto: UpdateJournalistDto,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AdminJournalist> {
    const journalist = await this.loadForAdmin(id);
    await this.assertManages(id, actor);
    const profile = await this.profileKey(journalist, actor, unlock);
    try {
      const current = this.decryptProfile(journalist, profile);
      const changes: Record<string, unknown> = {};
      for (const field of [
        'fullName',
        'fullNameEn',
        'passportData',
        'taxNumber',
        'phone',
        'nszhuMember',
      ] as const)
        if (dto[field] !== undefined) changes[field] = dto[field];
      if (dto.birthDate !== undefined) changes.birthDate = dto.birthDate;
      const userData: Prisma.UserUpdateInput = {};
      if (dto.email) {
        const email = this.blindIndexes.normalizeEmail(dto.email);
        const index = this.blindIndexes.email(email);
        const owner = await this.prisma.user.findFirst({ where: { emailBlindIndex: index } });
        if (owner && owner.id !== journalist.userId)
          throw new ConflictException('A user with this email already exists');
        userData.emailBlindIndex = index;
        userData.encryptedData = this.userKeys.encryptUserData(
          journalist.userId,
          { email },
          profile,
        );
      }
      if (dto.password) {
        userData.passwordHash = await argon2.hash(dto.password);
        Object.assign(
          userData,
          await this.userKeys.wrapExisting(journalist.userId, dto.password, profile),
          { tokenVersion: { increment: 1 } },
        );
      }
      await this.prisma.journalist.update({
        where: { id },
        data: {
          encryptedData: this.payloads.encrypt(
            'journalist',
            id,
            `user:${journalist.userId}`,
            { ...current, ...changes },
            profile,
          ),
          ...(Object.keys(userData).length ? { user: { update: userData } } : {}),
        },
      });
      return this.toAdminDto(await this.loadForAdmin(id), actor, unlock, profile);
    } finally {
      profile.fill(0);
    }
  }

  /** Superadmin soft-delete of the whole journalist (account, cards and
   *  memberships): hidden immediately, restorable within the grace window, and
   *  purged for good afterwards (which cancels the cards and frees the email). */
  async remove(id: number): Promise<{ success: boolean }> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (!journalist) {
      throw new NotFoundException('Journalist not found');
    }
    this.sessions.revokeUser(journalist.userId);
    await this.prisma.user.update({
      where: { id: journalist.userId },
      data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  /** Superadmin restore of a soft-deleted journalist, in whatever configuration
   *  it had (memberships and cards are untouched by the soft delete). */
  async restore(id: number, actor: JwtPayload, unlock?: string): Promise<AdminJournalist> {
    const journalist = await this.prisma.journalist.findUnique({ where: { id } });
    if (!journalist) throw new NotFoundException('Journalist not found');
    await this.prisma.user.update({ where: { id: journalist.userId }, data: { deletedAt: null } });
    return this.safeAdminDto(await this.loadForAdmin(id), actor, unlock);
  }

  /** Lists soft-deleted journalists still inside the grace window (Superadmin
   *  "trash"), so they can be restored before the purge removes them. */
  async findDeleted(actor: JwtPayload, unlock?: string): Promise<AdminJournalist[]> {
    const journalists = await this.prisma.journalist.findMany({
      where: { user: { deletedAt: { not: null } } },
      include: ADMIN_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return Promise.all(
      journalists.map((journalist) =>
        this.toAdminDto(journalist, actor, unlock).catch(() => this.redactedDto(journalist)),
      ),
    );
  }

  /** Encrypts an administrator-uploaded photo with the profile DEK. */
  async setPhoto(
    id: number,
    bytes: Buffer,
    mimeType: string,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<AdminJournalist> {
    const journalist = await this.loadForAdmin(id);
    await this.assertManages(id, actor);
    const profile = await this.profileKey(journalist, actor, unlock);
    try {
      const fileId = await this.files.store({
        ownerType: 'user',
        ownerId: String(journalist.userId),
        purpose: 'profile-photo',
        mimeType,
        bytes,
        ownerKey: profile,
      });
      const current = this.decryptProfile(journalist, profile);
      await this.prisma.journalist.update({
        where: { id },
        data: {
          encryptedData: this.payloads.encrypt(
            'journalist',
            id,
            `user:${journalist.userId}`,
            { ...current, photoPath: `/media/${fileId}` },
            profile,
          ),
        },
      });
      await this.files.cleanupReplaced('user', String(journalist.userId), 'profile-photo', fileId);
      return this.toAdminDto(await this.loadForAdmin(id), actor, unlock, profile);
    } finally {
      profile.fill(0);
    }
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

  private async toAdminDto(
    journalist: JournalistWithUser,
    actor: JwtPayload,
    unlock?: string,
    supplied?: Buffer,
  ): Promise<AdminJournalist> {
    let hydrated: JournalistWithUser & Partial<JournalistSecret> = journalist;
    let email = journalist.user.emailBlindIndex ?? '';
    let key: Buffer | undefined;
    if (journalist.encryptedData || journalist.user.encryptedData) {
      key = supplied ? Buffer.from(supplied) : await this.profileKey(journalist, actor, unlock);
      if (journalist.encryptedData)
        hydrated = {
          ...journalist,
          ...this.payloads.decrypt<Partial<JournalistSecret>>(
            'journalist',
            journalist.id,
            `user:${journalist.userId}`,
            journalist.encryptedData,
            key,
          ),
        };
      if (journalist.user.encryptedData)
        email = this.userKeys.decryptUserData<{ email: string }>(
          journalist.userId,
          journalist.user.encryptedData,
          key,
        ).email;
    }
    try {
      const privatePhotoId = hydrated.photoPath?.match(/^\/media\/([0-9a-f-]+)$/i)?.[1];
      if (privatePhotoId && key) {
        const photo = await this.files.read(privatePhotoId, key);
        hydrated = {
          ...hydrated,
          photoPath: `/public-media/${this.publicMedia.put(photo.bytes, photo.mimeType, 900)}`,
        };
      }
      const fullName = hydrated.fullName ?? '';
      const photoPath = hydrated.photoPath ?? null;
      const birthDate = hydrated.birthDate ?? null;
      const passportData = hydrated.passportData ?? null;
      const taxNumber = hydrated.taxNumber ?? null;
      const phone = hydrated.phone ?? null;
      return {
        id: hydrated.id,
        userId: hydrated.userId,
        publicId: hydrated.publicId,
        email,
        emailVerified: Boolean(hydrated.user.emailVerifiedAt),
        fullName,
        fullNameEn: hydrated.fullNameEn ?? '',
        position: hydrated.position ?? '',
        positionEn: hydrated.positionEn ?? '',
        organization: hydrated.organization ?? '',
        organizationEn: hydrated.organizationEn ?? '',
        photoPath,
        birthDate: birthDate ? toIsoDate(birthDate) : null,
        passportData,
        taxNumber,
        phone,
        nszhuMember: hydrated.nszhuMember ?? false,
        selfRegistered: hydrated.selfRegistered,
        profileComplete: isProfileComplete({
          fullName,
          photoPath,
          birthDate,
          passportData,
          taxNumber,
          phone,
        }),
        cardsCount: hydrated._count.cards,
        memberships: hydrated.memberships.map((m) => ({
          id: m.editorial.id,
          name: m.editorial.publicName,
        })),
      };
    } finally {
      key?.fill(0);
    }
  }
  private async profileKey(
    journalist: JournalistWithUser,
    actor: JwtPayload,
    unlock?: string,
  ): Promise<Buffer> {
    for (const membership of journalist.memberships) {
      if (actor.role === 'EDITORIAL_ADMIN' && membership.editorialId !== actor.editorialId)
        continue;
      let editorial: Buffer;
      try {
        editorial = this.editorialKey(actor, unlock, membership.editorialId);
      } catch {
        continue;
      }
      try {
        const grant = await this.prisma.editorialDataKeyGrant.findUnique({
          where: {
            userId_editorialId: { userId: journalist.userId, editorialId: membership.editorialId },
          },
        });
        if (grant?.keyEnvelope)
          return this.hierarchy.unwrapProfileForEditorial(
            journalist.userId,
            membership.editorialId,
            grant.keyEnvelope,
            editorial,
          );
        if (grant?.sealedKeyEnvelope) {
          // First read after a consent join / backfill: unseal with the
          // Editorial KEK and materialise the fast symmetric grant.
          const profileKey = await this.hierarchy.unsealProfileForEditorial(
            membership.editorialId,
            grant.sealedKeyEnvelope,
            editorial,
          );
          await this.prisma.editorialDataKeyGrant.update({
            where: {
              userId_editorialId: {
                userId: journalist.userId,
                editorialId: membership.editorialId,
              },
            },
            data: {
              keyEnvelope: this.hierarchy.wrapProfileForEditorial(
                journalist.userId,
                membership.editorialId,
                profileKey,
                editorial,
              ),
            },
          });
          return profileKey;
        }
      } finally {
        editorial.fill(0);
      }
    }
    // Superadmin universal read: decrypt via the system read key when no
    // editorial grant applies (e.g. a self-registered journalist).
    if (actor.role === 'ADMIN' && journalist.user.systemKeyEnvelope && unlock) {
      try {
        const systemKey = this.sessions.key(unlock, actor.sub, 'system');
        try {
          return await this.hierarchy.unsealProfileForSystem(
            journalist.user.systemKeyEnvelope,
            systemKey,
          );
        } finally {
          systemKey.fill(0);
        }
      } catch {
        // Fall through to the shared error below.
      }
    }
    throw new BadRequestException('Profile encryption grant and unlock are required');
  }
  private editorialKey(actor: JwtPayload, token: string | undefined, editorialId: number): Buffer {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      return this.sessions.key(token, actor.sub, `editorial:${editorialId}`);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }
  /** The initial encrypted questionnaire payload built from the create DTO. */
  private profileData(dto: CreateJournalistDto): JournalistSecret {
    return {
      fullName: dto.fullName,
      fullNameEn: dto.fullNameEn ?? '',
      position: '',
      positionEn: '',
      organization: '',
      organizationEn: '',
      photoPath: null,
      birthDate: dto.birthDate ?? null,
      passportData: dto.passportData ?? null,
      taxNumber: dto.taxNumber ?? null,
      phone: dto.phone ?? null,
      nszhuMember: dto.nszhuMember ?? false,
    };
  }
  /** Decrypts a journalist's questionnaire payload (empty when none stored). */
  private decryptProfile(
    journalist: { id: number; userId: number; encryptedData: Prisma.JsonValue | null },
    profile: Buffer,
  ): Record<string, unknown> {
    if (!journalist.encryptedData) return {};
    return this.payloads.decrypt<Record<string, unknown>>(
      'journalist',
      journalist.id,
      `user:${journalist.userId}`,
      journalist.encryptedData,
      profile,
    );
  }
}
