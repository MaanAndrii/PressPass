import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { constants, createHash, generateKeyPairSync, privateDecrypt, publicEncrypt } from 'crypto';
import { DataEncryptionService } from './data-encryption.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KeyHierarchyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: DataEncryptionService,
  ) {}
  fingerprint(key: Buffer): string {
    return createHash('sha256').update(key).digest('base64url');
  }

  async enrollAdmin(userId: number, passphrase: string): Promise<Buffer> {
    const adminKey = this.crypto.generateDataKey();
    const wrapping = await this.crypto.createPasswordWrappingKey(passphrase);
    try {
      await this.prisma.adminKeyMaterial.create({
        data: {
          userId,
          passphraseKdf: this.json(wrapping.descriptor),
          fingerprint: this.fingerprint(adminKey),
          keyEnvelope: this.json(
            this.crypto.wrapKey(adminKey, wrapping.key, {
              entity: 'admin-key',
              entityId: String(userId),
              field: 'kek',
              ownerId: `user:${userId}`,
            }),
          ),
        },
      });
      return Buffer.from(adminKey);
    } finally {
      adminKey.fill(0);
      wrapping.key.fill(0);
    }
  }

  async rewrapAdmin(
    userId: number,
    currentPassphrase: string,
    newPassphrase: string,
  ): Promise<void> {
    const adminKey = await this.unlockAdmin(userId, currentPassphrase);
    const next = await this.crypto.createPasswordWrappingKey(newPassphrase);
    try {
      await this.prisma.adminKeyMaterial.update({
        where: { userId },
        data: {
          passphraseKdf: this.json(next.descriptor),
          keyEnvelope: this.json(
            this.crypto.wrapKey(adminKey, next.key, {
              entity: 'admin-key',
              entityId: String(userId),
              field: 'kek',
              ownerId: `user:${userId}`,
            }),
          ),
          keyVersion: { increment: 1 },
        },
      });
    } finally {
      adminKey.fill(0);
      next.key.fill(0);
    }
  }

  async unlockAdmin(userId: number, passphrase: string): Promise<Buffer> {
    const material = await this.prisma.adminKeyMaterial.findUniqueOrThrow({ where: { userId } });
    const wrapping = await this.crypto.derivePasswordWrappingKey(
      passphrase,
      material.passphraseKdf as never,
    );
    try {
      return this.crypto.unwrapKey(material.keyEnvelope as never, wrapping, {
        entity: 'admin-key',
        entityId: String(userId),
        field: 'kek',
        ownerId: `user:${userId}`,
      });
    } finally {
      wrapping.fill(0);
    }
  }

  async provisionSystemForFirstAdmin(userId: number, adminKey: Buffer): Promise<Buffer> {
    const existing = await this.prisma.systemKeyMaterial.findUnique({ where: { id: 1 } });
    if (existing)
      throw new Error('System key already exists and must be granted by an unlocked Superadmin');
    const systemKey = this.crypto.generateDataKey();
    try {
      const admin = await this.prisma.adminKeyMaterial.findUniqueOrThrow({ where: { userId } });
      await this.prisma.systemKeyMaterial.create({
        data: {
          id: 1,
          fingerprint: this.fingerprint(systemKey),
          adminSlots: {
            create: {
              adminKeyId: admin.id,
              keyEnvelope: this.json(
                this.crypto.wrapKey(systemKey, adminKey, {
                  entity: 'system-key',
                  entityId: '1',
                  field: 'kek',
                  ownerId: `admin:${userId}`,
                }),
              ),
            },
          },
        },
      });
      return Buffer.from(systemKey);
    } finally {
      systemKey.fill(0);
    }
  }

  async grantSystemToAdmin(
    adminUserId: number,
    systemKey: Buffer,
    adminKey: Buffer,
  ): Promise<void> {
    const admin = await this.prisma.adminKeyMaterial.findUniqueOrThrow({
      where: { userId: adminUserId },
    });
    await this.prisma.systemAdminKeySlot.upsert({
      where: { systemKeyId_adminKeyId: { systemKeyId: 1, adminKeyId: admin.id } },
      update: {
        revokedAt: null,
        keyEnvelope: this.json(
          this.crypto.wrapKey(systemKey, adminKey, {
            entity: 'system-key',
            entityId: '1',
            field: 'kek',
            ownerId: `admin:${adminUserId}`,
          }),
        ),
      },
      create: {
        systemKeyId: 1,
        adminKeyId: admin.id,
        keyEnvelope: this.json(
          this.crypto.wrapKey(systemKey, adminKey, {
            entity: 'system-key',
            entityId: '1',
            field: 'kek',
            ownerId: `admin:${adminUserId}`,
          }),
        ),
      },
    });
  }

  async grantEditorialToAdmin(
    editorialId: number,
    adminUserId: number,
    editorialKey: Buffer,
    adminKey: Buffer,
  ): Promise<void> {
    const editorial = await this.prisma.editorialKeyMaterial.findUniqueOrThrow({
      where: { editorialId },
    });
    const admin = await this.prisma.adminKeyMaterial.findUniqueOrThrow({
      where: { userId: adminUserId },
    });
    await this.prisma.editorialAdminKeySlot.upsert({
      where: { editorialKeyId_adminKeyId: { editorialKeyId: editorial.id, adminKeyId: admin.id } },
      update: {
        revokedAt: null,
        keyEnvelope: this.json(
          this.crypto.wrapKey(editorialKey, adminKey, {
            entity: 'editorial-key',
            entityId: String(editorialId),
            field: 'kek',
            ownerId: `admin:${adminUserId}`,
          }),
        ),
      },
      create: {
        editorialKeyId: editorial.id,
        adminKeyId: admin.id,
        keyEnvelope: this.json(
          this.crypto.wrapKey(editorialKey, adminKey, {
            entity: 'editorial-key',
            entityId: String(editorialId),
            field: 'kek',
            ownerId: `admin:${adminUserId}`,
          }),
        ),
      },
    });
  }

  async unlockEditorials(userId: number, adminKey: Buffer): Promise<Map<string, Buffer>> {
    const admin = await this.prisma.adminKeyMaterial.findUniqueOrThrow({
      where: { userId },
      include: {
        systemSlots: { where: { revokedAt: null } },
        editorialSlots: { where: { revokedAt: null }, include: { editorialKey: true } },
      },
    });
    const result = new Map<string, Buffer>();
    try {
      for (const slot of admin.systemSlots) {
        result.set(
          'system',
          this.crypto.unwrapKey(slot.keyEnvelope as never, adminKey, {
            entity: 'system-key',
            entityId: '1',
            field: 'kek',
            ownerId: `admin:${userId}`,
          }),
        );
      }
      for (const slot of admin.editorialSlots) {
        const editorialId = slot.editorialKey.editorialId;
        const key = this.crypto.unwrapKey(slot.keyEnvelope as never, adminKey, {
          entity: 'editorial-key',
          entityId: String(editorialId),
          field: 'kek',
          ownerId: `admin:${userId}`,
        });
        result.set(`editorial:${editorialId}`, key);
      }
      return result;
    } catch (error) {
      for (const key of result.values()) key.fill(0);
      throw error;
    }
  }

  async provisionEditorial(
    editorialId: number,
    adminUserId: number,
    adminKey: Buffer,
  ): Promise<Buffer> {
    const editorialKey = this.crypto.generateDataKey();
    try {
      await this.prisma.$transaction(async (tx) => {
        const material = await tx.editorialKeyMaterial.create({
          data: { editorialId, fingerprint: this.fingerprint(editorialKey) },
        });
        const admin = await tx.adminKeyMaterial.findUniqueOrThrow({
          where: { userId: adminUserId },
        });
        await tx.editorialAdminKeySlot.create({
          data: {
            editorialKeyId: material.id,
            adminKeyId: admin.id,
            keyEnvelope: this.json(
              this.crypto.wrapKey(editorialKey, adminKey, {
                entity: 'editorial-key',
                entityId: String(editorialId),
                field: 'kek',
                ownerId: `admin:${adminUserId}`,
              }),
            ),
          },
        });
      });
      return Buffer.from(editorialKey);
    } finally {
      editorialKey.fill(0);
    }
  }

  wrapProfileForEditorial(
    userId: number,
    editorialId: number,
    profileKey: Buffer,
    editorialKey: Buffer,
  ): Prisma.InputJsonValue {
    return this.json(
      this.crypto.wrapKey(profileKey, editorialKey, {
        entity: 'editorial-grant',
        entityId: `${editorialId}:${userId}`,
        field: 'profile-data-key',
        ownerId: `user:${userId}`,
      }),
    );
  }
  unwrapProfileForEditorial(
    userId: number,
    editorialId: number,
    envelope: unknown,
    editorialKey: Buffer,
  ): Buffer {
    return this.crypto.unwrapKey(envelope as never, editorialKey, {
      entity: 'editorial-grant',
      entityId: `${editorialId}:${userId}`,
      field: 'profile-data-key',
      ownerId: `user:${userId}`,
    });
  }

  async createRecoverySlots(input: {
    ownerType: string;
    ownerId: string;
    ownerKey: Buffer;
    superadminUserIds: number[];
    recoveryPassphrases: string[];
  }): Promise<string[]> {
    if (input.superadminUserIds.length !== 2 || input.recoveryPassphrases.length !== 2)
      throw new Error('Exactly two recovery authorities are required');
    const kits: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const superadminUserId = input.superadminUserIds[index]!;
      const slotNumber = index + 1;
      const existing = await this.prisma.superadminRecoveryKey.findUnique({
        where: { superadminUserId_slotNumber: { superadminUserId, slotNumber } },
      });
      if (existing) continue;
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 3072,
        publicExponent: 0x10001,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const fingerprint = createHash('sha256').update(publicKey).digest('base64url');
      const passphrase = await this.crypto.createPasswordWrappingKey(
        input.recoveryPassphrases[index]!,
      );
      try {
        const authority = await this.prisma.superadminRecoveryKey.create({
          data: { superadminUserId, slotNumber, publicKey, fingerprint },
        });
        const privateKeyEnvelope = this.crypto.encrypt(privateKey, passphrase.key, {
          entity: 'superadmin-recovery-key',
          entityId: String(authority.id),
          field: 'private-key',
          ownerId: `admin:${superadminUserId}`,
        });
        const kit = {
          version: 1,
          authorityId: authority.id,
          superadminUserId,
          slotNumber,
          fingerprint,
          kdf: passphrase.descriptor,
          privateKeyEnvelope,
        };
        kits.push(`pp-recovery-kit-v1.${Buffer.from(JSON.stringify(kit)).toString('base64url')}`);
      } finally {
        passphrase.key.fill(0);
      }
    }
    await this.wrapOwnerForRecovery(input.ownerType, input.ownerId, input.ownerKey);
    return kits;
  }

  async wrapOwnerForRecovery(
    ownerType: string,
    ownerId: string,
    ownerKey: Buffer,
    database: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const authorities = await database.superadminRecoveryKey.findMany({
      where: { revokedAt: null },
      orderBy: [{ slotNumber: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    if (authorities.length !== 2)
      throw new Error('Two active Superadmin recovery authorities are required');
    for (let index = 0; index < authorities.length; index += 1) {
      const authority = authorities[index]!;
      const slotNumber = index + 1;
      const ciphertext = publicEncrypt(
        { key: authority.publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
        ownerKey,
      ).toString('base64url');
      const keyEnvelope = this.json({ version: 1, algorithm: 'RSA-OAEP-256', ciphertext });
      await database.superadminKeySlot.upsert({
        where: { ownerType_ownerId_slotNumber: { ownerType, ownerId, slotNumber } },
        update: {
          superadminUserId: authority.superadminUserId,
          recoveryKeyId: authority.id,
          keyEnvelope,
          revokedAt: null,
        },
        create: {
          superadminUserId: authority.superadminUserId,
          recoveryKeyId: authority.id,
          ownerType,
          ownerId,
          slotNumber,
          keyEnvelope,
        },
      });
    }
  }

  async recoverOwnerKey(
    encodedKit: string,
    passphraseValue: string,
    ownerType?: string,
    ownerId?: string,
  ): Promise<{ ownerType: string; ownerId: string; key: Buffer }> {
    const prefix = 'pp-recovery-kit-v1.';
    if (!encodedKit.startsWith(prefix)) throw new Error('Unsupported recovery kit');
    const kit = JSON.parse(
      Buffer.from(encodedKit.slice(prefix.length), 'base64url').toString('utf8'),
    ) as {
      version: number;
      authorityId: number;
      fingerprint: string;
      kdf: unknown;
      privateKeyEnvelope: unknown;
    };
    const authority = await this.prisma.superadminRecoveryKey.findUniqueOrThrow({
      where: { id: kit.authorityId },
    });
    if (authority.fingerprint !== kit.fingerprint || authority.revokedAt)
      throw new Error('Recovery authority is revoked or mismatched');
    const wrapping = await this.crypto.derivePasswordWrappingKey(passphraseValue, kit.kdf as never);
    try {
      const privateKey = this.crypto
        .decrypt(kit.privateKeyEnvelope as never, wrapping, {
          entity: 'superadmin-recovery-key',
          entityId: String(authority.id),
          field: 'private-key',
          ownerId: `admin:${authority.superadminUserId}`,
        })
        .toString('utf8');
      const slot =
        ownerType && ownerId
          ? await this.prisma.superadminKeySlot.findFirstOrThrow({
              where: { ownerType, ownerId, recoveryKeyId: authority.id, revokedAt: null },
            })
          : await this.prisma.superadminKeySlot.findFirstOrThrow({
              where: { recoveryKeyId: authority.id, revokedAt: null },
            });
      const envelope = slot.keyEnvelope as unknown as {
        version: number;
        algorithm: string;
        ciphertext: string;
      };
      if (envelope.version !== 1 || envelope.algorithm !== 'RSA-OAEP-256')
        throw new Error('Unsupported recovery envelope');
      return {
        ownerType: slot.ownerType,
        ownerId: slot.ownerId,
        key: privateDecrypt(
          { key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
          Buffer.from(envelope.ciphertext, 'base64url'),
        ),
      };
    } finally {
      wrapping.fill(0);
    }
  }

  private json(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
