import { BadRequestException, Injectable } from '@nestjs/common';
import type { Role } from '@presspass/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KeyHierarchyService } from './key-hierarchy.service';
import { UnlockSessionService } from './unlock-session.service';
import { UserKeyMaterialService } from './user-key-material.service';
import { BlindIndexService } from './blind-index.service';

@Injectable()
export class EncryptionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userKeys: UserKeyMaterialService,
    private readonly hierarchy: KeyHierarchyService,
    private readonly sessions: UnlockSessionService,
    private readonly blind: BlindIndexService,
  ) {}

  async unlock(
    userId: number,
    role: Role,
    passphrase: string,
    existingToken?: string,
  ): Promise<{ unlockToken: string; expiresAt: string }> {
    if (role === 'JOURNALIST') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.passwordKdf || !user.dataKeyEnvelope)
        throw new BadRequestException('Encryption passphrase enrollment required');
      const profile = await this.userKeys.unlock(
        userId,
        passphrase,
        user.passwordKdf,
        user.dataKeyEnvelope,
      );
      try {
        const result = this.sessions.create(userId, new Map([['profile', profile]]));
        return { unlockToken: result.token, expiresAt: result.expiresAt };
      } finally {
        profile.fill(0);
      }
    }
    let existingProfile: Buffer | undefined;
    if (existingToken) {
      try {
        existingProfile = this.sessions.key(existingToken, userId, 'profile');
      } catch {
        existingProfile = undefined;
      }
    }
    const admin = await this.hierarchy.unlockAdmin(userId, passphrase);
    const keys = await this.hierarchy.unlockEditorials(userId, admin);
    keys.set('admin', admin);
    if (existingProfile) keys.set('profile', existingProfile);
    // A Superadmin holds the System KEK: make sure the system read key exists so
    // every profile can be sealed for universal read access (backfills upgrades).
    const systemKey = keys.get('system');
    if (systemKey) await this.hierarchy.ensureSystemReadKey(systemKey);
    // Backfill each unlocked editorial's read key so join confirmations can seal
    // to it even for editorials created before this feature.
    for (const [name, key] of keys) {
      const match = /^editorial:(\d+)$/.exec(name);
      if (match) await this.hierarchy.ensureEditorialReadKey(Number(match[1]), key);
    }
    try {
      const result = this.sessions.create(userId, keys);
      return { unlockToken: result.token, expiresAt: result.expiresAt };
    } finally {
      for (const key of keys.values()) key.fill(0);
    }
  }

  async enroll(
    userId: number,
    role: Role,
    passphrase: string,
    verifiedEmail?: string,
    existingToken?: string,
  ): Promise<{ unlockToken: string; expiresAt: string }> {
    if (role === 'JOURNALIST') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.dataKeyEnvelope || user.passwordKdf)
        throw new BadRequestException('Encryption passphrase is already enrolled');
      if (user.encryptedData) throw new BadRequestException('SUPERADMIN_RECOVERY_REQUIRED');
      if (!verifiedEmail)
        throw new BadRequestException('Verified email is required for encryption enrollment');
      const email = this.blind.normalizeEmail(verifiedEmail);
      let systemSeal: Prisma.InputJsonValue | undefined;
      const material = await this.userKeys.provision(userId, passphrase, { email }, async (key) => {
        await this.hierarchy.wrapOwnerForRecovery('user', String(userId), key);
        const publicKey = await this.hierarchy.getSystemReadPublicKey();
        if (publicKey) systemSeal = this.hierarchy.sealProfileForSystem(key, publicKey);
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...material,
          emailBlindIndex: this.blind.email(email),
          ...(systemSeal ? { systemKeyEnvelope: systemSeal } : {}),
        },
      });
    } else {
      const existing = await this.prisma.adminKeyMaterial.findUnique({ where: { userId } });
      if (existing)
        throw new BadRequestException('Administrator encryption key is already enrolled');
      const adminKey = await this.hierarchy.enrollAdmin(userId, passphrase);
      try {
        if (role === 'ADMIN') {
          const system = await this.prisma.systemKeyMaterial.findUnique({ where: { id: 1 } });
          if (!system) {
            const systemKey = await this.hierarchy.provisionSystemForFirstAdmin(userId, adminKey);
            systemKey.fill(0);
          }
        }
      } finally {
        adminKey.fill(0);
      }
    }
    return this.unlock(userId, role, passphrase, existingToken);
  }

  async claimEditorial(
    userId: number,
    role: Role,
    editorialId: number,
    token?: string,
  ): Promise<{ success: true }> {
    if (role !== 'ADMIN') throw new BadRequestException('Superadmin role required');
    if (!token) throw new BadRequestException('Encryption unlock required');
    let admin: Buffer;
    let editorial: Buffer;
    try {
      admin = this.sessions.key(token, userId, 'admin');
      editorial = this.sessions.sharedKey(`editorial:${editorialId}`);
    } catch {
      throw new BadRequestException('The administrator and editorial must both be unlocked');
    }
    try {
      await this.hierarchy.grantEditorialToAdmin(editorialId, userId, editorial, admin);
      return { success: true };
    } finally {
      admin.fill(0);
      editorial.fill(0);
    }
  }

  async grantEditorial(
    userId: number,
    editorialId: number,
    token?: string,
  ): Promise<{ success: true }> {
    if (!token) throw new BadRequestException('Encryption unlock required');
    const journalist = await this.prisma.journalist.findUnique({
      where: { userId },
      include: { memberships: true },
    });
    if (!journalist?.memberships.some((item) => item.editorialId === editorialId))
      throw new BadRequestException('Editorial membership is required');
    let profile: Buffer;
    let editorial: Buffer;
    try {
      profile = this.sessions.key(token, userId, 'profile');
      editorial = this.sessions.sharedKey(`editorial:${editorialId}`);
    } catch {
      throw new BadRequestException('The profile and editorial must both be unlocked');
    }
    try {
      await this.prisma.editorialDataKeyGrant.upsert({
        where: { userId_editorialId: { userId, editorialId } },
        update: {
          keyEnvelope: this.hierarchy.wrapProfileForEditorial(
            userId,
            editorialId,
            profile,
            editorial,
          ),
        },
        create: {
          userId,
          editorialId,
          keyEnvelope: this.hierarchy.wrapProfileForEditorial(
            userId,
            editorialId,
            profile,
            editorial,
          ),
        },
      });
      return { success: true };
    } finally {
      profile.fill(0);
      editorial.fill(0);
    }
  }

  async createRecoverySlots(
    userId: number,
    role: Role,
    token: string | undefined,
    dto: {
      ownerType: string;
      ownerId: string;
      superadminUserIds: number[];
      recoveryPassphrases: string[];
    },
  ): Promise<{ recoveryKits: string[] }> {
    if (!token) throw new BadRequestException('Encryption unlock required');
    const allowed = dto.ownerType === 'user' ? dto.ownerId === String(userId) : role === 'ADMIN';
    if (!allowed) throw new BadRequestException('Recovery owner is not accessible');
    const keyName = dto.ownerType === 'user' ? 'profile' : `editorial:${dto.ownerId}`;
    let key: Buffer;
    try {
      key = this.sessions.key(token, userId, keyName);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
    try {
      return { recoveryKits: await this.hierarchy.createRecoverySlots({ ...dto, ownerKey: key }) };
    } finally {
      key.fill(0);
    }
  }

  async changePassphrase(
    userId: number,
    role: Role,
    currentPassphrase: string,
    newPassphrase: string,
  ): Promise<{ success: true }> {
    if (role === 'JOURNALIST') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.passwordKdf || !user.dataKeyEnvelope)
        throw new BadRequestException('Encryption enrollment required');
      const material = await this.userKeys.rewrap(
        userId,
        currentPassphrase,
        newPassphrase,
        user.passwordKdf,
        user.dataKeyEnvelope,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { ...material, tokenVersion: { increment: 1 } },
      });
    } else {
      await this.hierarchy.rewrapAdmin(userId, currentPassphrase, newPassphrase);
    }
    this.sessions.revokeUser(userId);
    return { success: true };
  }

  async recoverUser(
    actorRole: Role,
    dto: {
      ownerId: string;
      recoveryKit: string;
      recoveryPassphrase: string;
      newOwnerPassphrase: string;
    },
  ): Promise<{ success: true }> {
    if (actorRole !== 'ADMIN') throw new BadRequestException('Superadmin role required');
    const recovered = await this.hierarchy.recoverOwnerKey(
      dto.recoveryKit,
      dto.recoveryPassphrase,
      'user',
      dto.ownerId,
    );
    try {
      if (recovered.ownerType !== 'user')
        throw new BadRequestException('Recovery kit is not a user slot');
      const userId = Number(recovered.ownerId);
      const material = await this.userKeys.wrapExisting(
        userId,
        dto.newOwnerPassphrase,
        recovered.key,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { ...material, tokenVersion: { increment: 1 } },
      });
      this.sessions.revokeUser(userId);
      return { success: true };
    } finally {
      recovered.key.fill(0);
    }
  }

  lock(userId: number): { success: true } {
    this.sessions.revokeUser(userId);
    return { success: true };
  }

  // ── Device-bound unlock (PWA "stay signed in", journalists only) ────────────
  // The journalist's profile DEK is handed to their device once (after a normal
  // password unlock) and kept there wrapped by a non-extractable key. On the next
  // app open the device sends it back to re-establish the short in-memory unlock
  // session — no password re-entry. Dump-safe: the server persists nothing.

  /** Returns the current session's profile DEK so the device can remember it. */
  deviceKey(userId: number, role: Role, token?: string): { profileKey: string } {
    if (role !== 'JOURNALIST')
      throw new BadRequestException('Device key is available to journalists');
    if (!token) throw new BadRequestException('Encryption unlock required');
    let key: Buffer;
    try {
      key = this.sessions.key(token, userId, 'profile');
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
    try {
      return { profileKey: key.toString('base64') };
    } finally {
      key.fill(0);
    }
  }

  /** Re-establishes an unlock session from the device-held profile DEK. */
  async deviceUnlock(
    userId: number,
    role: Role,
    profileKeyB64: string,
  ): Promise<{ unlockToken: string; expiresAt: string }> {
    if (role !== 'JOURNALIST')
      throw new BadRequestException('Device unlock is available to journalists');
    const key = Buffer.from(profileKeyB64 ?? '', 'base64');
    if (key.length !== 32) throw new BadRequestException('Invalid device key');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Account not found');
    try {
      // Confirm the key actually opens this account before trusting it, so a
      // stale device key fails cleanly (the client then asks for the password).
      if (user.encryptedData) {
        try {
          this.userKeys.decryptUserData(userId, user.encryptedData, key);
        } catch {
          throw new BadRequestException('DEVICE_KEY_INVALID');
        }
      }
      const result = this.sessions.create(userId, new Map([['profile', key]]));
      return { unlockToken: result.token, expiresAt: result.expiresAt };
    } finally {
      key.fill(0);
    }
  }
}
