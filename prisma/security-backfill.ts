import { chmod, readFile, rm, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { BlindIndexService } from '../apps/api/src/crypto/blind-index.service';
import { DataEncryptionService } from '../apps/api/src/crypto/data-encryption.service';
import { ProtectedDataService } from '../apps/api/src/crypto/protected-data.service';
import { UserKeyMaterialService } from '../apps/api/src/crypto/user-key-material.service';
import { KeyHierarchyService } from '../apps/api/src/crypto/key-hierarchy.service';
import { DomainPayloadService } from '../apps/api/src/crypto/domain-payload.service';
import { EncryptedFileService } from '../apps/api/src/crypto/encrypted-file.service';
import type { PrismaService } from '../apps/api/src/prisma/prisma.service';

const prisma = new PrismaClient();
const config = new ConfigService(process.env);
const crypto = new DataEncryptionService();
const protectedData = new ProtectedDataService(crypto);
const blind = new BlindIndexService(config);
const db = prisma as unknown as PrismaService;
const users = new UserKeyMaterialService(crypto, config, protectedData);
const hierarchy = new KeyHierarchyService(db, crypto);
const payloads = new DomainPayloadService(protectedData);
const files = new EncryptedFileService(db, crypto, config);
const kits: string[] = [];
const recoveryOnlyUsers: number[] = [];
const adminEnrollmentPassphrases: Array<{ userId: number; passphrase: string }> = [];
const userKeys = new Map<number, Buffer>();
const editorialKeys = new Map<number, Buffer>();
const recoveryPassphrases = [
  process.env.SUPERADMIN_RECOVERY_PASSPHRASE_1,
  process.env.SUPERADMIN_RECOVERY_PASSPHRASE_2,
];

async function keyForUser(user: {
  id: number;
  recoveryKeyEnvelope: Prisma.JsonValue | null;
  passwordKdf: Prisma.JsonValue | null;
  dataKeyEnvelope: Prisma.JsonValue | null;
  encryptedData: Prisma.JsonValue | null;
}): Promise<Buffer> {
  const cached = userKeys.get(user.id);
  if (cached) return cached;
  let key: Buffer;
  if (user.recoveryKeyEnvelope) key = users.recover(user.id, user.recoveryKeyEnvelope);
  else if (
    user.id === Number(process.env.SECURITY_BACKFILL_ADMIN_ID) &&
    user.passwordKdf &&
    user.dataKeyEnvelope &&
    process.env.ADMIN_PASSWORD
  )
    key = await users.unlock(
      user.id,
      process.env.ADMIN_PASSWORD,
      user.passwordKdf,
      user.dataKeyEnvelope,
    );
  else if (user.encryptedData)
    throw new Error(`Owner key for encrypted user ${user.id} is unavailable`);
  else {
    key = crypto.generateDataKey();
    recoveryOnlyUsers.push(user.id);
  }
  userKeys.set(user.id, key);
  return key;
}
async function encryptedLegacyFile(
  pathValue: string | null,
  ownerType: string,
  ownerId: string,
  purpose: string,
  ownerKey: Buffer,
  editorialId?: number,
): Promise<string | null> {
  if (!pathValue || pathValue.startsWith('/media/')) return pathValue;
  const relative = pathValue.replace(/^\/uploads\//, '');
  const absolute = `${process.env.UPLOADS_DIR ?? './uploads'}/${relative}`;
  try {
    const bytes = await readFile(absolute);
    const mimeType = pathValue.endsWith('.png')
      ? 'image/png'
      : pathValue.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const id = await files.store({
      ownerType,
      ownerId,
      purpose,
      mimeType,
      bytes,
      ownerKey,
      editorialId,
    });
    await rm(absolute, { force: true });
    return `/media/${id}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function recovery(
  ownerType: string,
  ownerId: string,
  key: Buffer,
  adminId: number,
): Promise<void> {
  if (!recoveryPassphrases[0] || !recoveryPassphrases[1])
    throw new Error('Both SUPERADMIN_RECOVERY_PASSPHRASE_1/2 are required');
  const existing = await prisma.superadminKeySlot.count({
    where: { ownerType, ownerId, revokedAt: null },
  });
  if (existing === 2) return;
  kits.push(
    ...(await hierarchy.createRecoverySlots({
      ownerType,
      ownerId,
      ownerKey: key,
      superadminUserIds: [adminId, adminId],
      recoveryPassphrases: recoveryPassphrases as [string, string],
    })),
  );
}
async function main(): Promise<void> {
  blind.email('self-test@example.invalid');
  const adminEmail = blind.normalizeEmail(process.env.ADMIN_EMAIL ?? '');
  const adminIndex = blind.email(adminEmail);
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', OR: [{ emailBlindIndex: adminIndex }, { email: adminEmail }] },
  });
  if (!admin) throw new Error('Initial Superadmin not found');
  const adminPassphrase = process.env.ADMIN_ENCRYPTION_PASSPHRASE;
  if (!adminPassphrase) throw new Error('ADMIN_ENCRYPTION_PASSPHRASE is required');
  process.env.SECURITY_BACKFILL_ADMIN_ID = String(admin.id);
  const adminKey = await hierarchy.unlockAdmin(admin.id, adminPassphrase);
  const unlocked = await hierarchy.unlockEditorials(admin.id, adminKey);
  let systemKey = unlocked.get('system');
  if (!systemKey) {
    // A system key already in the database but not linked to this administrator
    // means the DB predates the current key material (e.g. a re-install that
    // regenerated secrets over a stale database). Provisioning would create a
    // second, irreconcilable system key — fail with an actionable message.
    if (await prisma.systemKeyMaterial.findUnique({ where: { id: 1 } }))
      throw new Error(
        'System key material exists but is not granted to this administrator. The ' +
          'database predates the current encryption secrets (likely a re-install over a ' +
          'stale database). Restore the original .env, or reset the database ' +
          '(deploy/install.sh --reset-db) to start fresh.',
      );
    systemKey = await hierarchy.provisionSystemForFirstAdmin(admin.id, adminKey);
  }
  await recovery('system', '1', systemKey, admin.id);

  for (const user of await prisma.user.findMany()) {
    const needsPlaintextMigration =
      !user.encryptedData ||
      !user.emailBlindIndex ||
      user.email.includes('@') ||
      Boolean(user.googleId && !user.googleIdBlindIndex);
    const key = await keyForUser(user);
    if (needsPlaintextMigration && key) {
      const email = user.email.includes('@')
        ? blind.normalizeEmail(user.email)
        : user.encryptedData
          ? users.decryptUserData<{ email: string }>(user.id, user.encryptedData, key).email
          : user.id === admin.id
            ? adminEmail
            : null;
      if (!email) throw new Error(`User ${user.id} has no recoverable encrypted email`);
      const index = blind.email(email);
      const googleIdBlindIndex = user.googleId ? blind.value('google-id', user.googleId) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: index,
          emailBlindIndex: index,
          googleId: googleIdBlindIndex,
          googleIdBlindIndex,
          encryptedData: users.encryptUserData(user.id, { email }, key),
        },
      });
    }
    {
      await recovery('user', String(user.id), key, admin.id);
      await prisma.user.update({
        where: { id: user.id },
        // A nullable Prisma JSON field distinguishes SQL NULL (`DbNull`) from
        // the JSON value `null`. The verifier intentionally requires SQL NULL
        // so no legacy recovery envelope remains in this column.
        data: { recoveryKeyEnvelope: Prisma.DbNull },
      });
    }
  }

  for (const journalist of await prisma.journalist.findMany()) {
    const key =
      userKeys.get(journalist.userId) ??
      (await keyForUser(await prisma.user.findUniqueOrThrow({ where: { id: journalist.userId } })));
    if (!journalist.encryptedData) {
      const photoPath = await encryptedLegacyFile(
        journalist.photoPath,
        'user',
        String(journalist.userId),
        'profile-photo',
        key,
      );
      const data = {
        fullName: journalist.fullName,
        fullNameEn: journalist.fullNameEn,
        position: journalist.position,
        positionEn: journalist.positionEn,
        organization: journalist.organization,
        organizationEn: journalist.organizationEn,
        photoPath,
        birthDate: journalist.birthDate?.toISOString().slice(0, 10) ?? null,
        passportData: journalist.passportData,
        taxNumber: journalist.taxNumber,
        phone: journalist.phone,
        nszhuMember: journalist.nszhuMember,
      };
      await prisma.journalist.update({
        where: { id: journalist.id },
        data: {
          encryptedData: payloads.encrypt(
            'journalist',
            journalist.id,
            `user:${journalist.userId}`,
            data,
            key,
          ),
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
        },
      });
    }
  }

  for (const editorial of await prisma.editorial.findMany()) {
    let key = unlocked.get(`editorial:${editorial.id}`);
    if (!key) {
      key = await hierarchy.provisionEditorial(editorial.id, admin.id, adminKey);
      unlocked.set(`editorial:${editorial.id}`, key);
    }
    editorialKeys.set(editorial.id, key);
    await recovery('editorial', String(editorial.id), key, admin.id);
    if (!editorial.encryptedData) {
      const logoPath = await encryptedLegacyFile(
        editorial.logoPath,
        'editorial',
        String(editorial.id),
        'logo',
        key,
        editorial.id,
      );
      const data = {
        name: editorial.name,
        displayNameUk: editorial.displayNameUk,
        displayNameEn: editorial.displayNameEn,
        mediaId: editorial.mediaId,
        cardNumberPrefix: editorial.cardNumberPrefix,
        cardNumberTemplate: editorial.cardNumberTemplate,
        edrpou: editorial.edrpou,
        website: editorial.website,
        logoPath,
        director: editorial.director,
        email: editorial.email,
        address: editorial.address,
        phone: editorial.phone,
      };
      await prisma.editorial.update({
        where: { id: editorial.id },
        data: {
          encryptedData: payloads.encrypt(
            'editorial',
            editorial.id,
            `editorial:${editorial.id}`,
            data,
            key,
          ),
          cardNumberPrefixBlindIndex: editorial.cardNumberPrefix
            ? blind.value('card-prefix', editorial.cardNumberPrefix)
            : null,
          name: '',
          displayNameUk: '',
          displayNameEn: '',
          mediaId: '',
          cardNumberPrefix: '',
          cardNumberTemplate: '{prefix}-{year}-{seq:6}',
          edrpou: '',
          website: '',
          logoPath: null,
          director: '',
          email: '',
          address: '',
          phone: '',
        },
      });
    }
  }

  for (const account of await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'EDITORIAL_ADMIN'] }, id: { not: admin.id } },
    include: { adminKeyMaterial: true },
  })) {
    if (account.adminKeyMaterial) continue;
    const enrollmentPassphrase = randomBytes(32).toString('base64url');
    const accountAdminKey = await hierarchy.enrollAdmin(account.id, enrollmentPassphrase);
    try {
      if (account.role === 'ADMIN') {
        await hierarchy.grantSystemToAdmin(account.id, systemKey, accountAdminKey);
        for (const [editorialId, editorialKey] of editorialKeys)
          await hierarchy.grantEditorialToAdmin(
            editorialId,
            account.id,
            editorialKey,
            accountAdminKey,
          );
      } else if (account.editorialId) {
        const editorialKey = editorialKeys.get(account.editorialId);
        if (!editorialKey) throw new Error(`Missing editorial key for administrator ${account.id}`);
        await hierarchy.grantEditorialToAdmin(
          account.editorialId,
          account.id,
          editorialKey,
          accountAdminKey,
        );
      }
      adminEnrollmentPassphrases.push({ userId: account.id, passphrase: enrollmentPassphrase });
    } finally {
      accountAdminKey.fill(0);
    }
  }

  for (const membership of await prisma.editorialMembership.findMany({
    include: { journalist: true },
  })) {
    const profile = userKeys.get(membership.journalist.userId);
    const editorial = editorialKeys.get(membership.editorialId);
    if (!profile || !editorial) throw new Error('Missing migration owner key');
    await prisma.editorialDataKeyGrant.upsert({
      where: {
        userId_editorialId: {
          userId: membership.journalist.userId,
          editorialId: membership.editorialId,
        },
      },
      update: {
        keyEnvelope: hierarchy.wrapProfileForEditorial(
          membership.journalist.userId,
          membership.editorialId,
          profile,
          editorial,
        ),
      },
      create: {
        userId: membership.journalist.userId,
        editorialId: membership.editorialId,
        keyEnvelope: hierarchy.wrapProfileForEditorial(
          membership.journalist.userId,
          membership.editorialId,
          profile,
          editorial,
        ),
      },
    });
  }

  for (const card of await prisma.card.findMany({
    include: { journalist: true, editorial: true },
  })) {
    if (card.encryptedData) continue;
    const profile = userKeys.get(card.journalist.userId);
    if (!profile) throw new Error('Missing card owner key');
    const editorialKey = card.editorialId ? editorialKeys.get(card.editorialId) : undefined;
    const editorialData =
      card.editorial?.encryptedData && editorialKey
        ? payloads.decrypt<Record<string, unknown>>(
            'editorial',
            card.editorial.id,
            `editorial:${card.editorial.id}`,
            card.editorial.encryptedData,
            editorialKey,
          )
        : card.editorial;
    let cardLogoPath: string | null = null;
    const logoId =
      typeof editorialData?.logoPath === 'string'
        ? editorialData.logoPath.match(/^\/media\/([0-9a-f-]+)$/i)?.[1]
        : undefined;
    if (logoId && editorialKey) {
      const logo = await files.read(logoId, editorialKey);
      const copyId = await files.store({
        ownerType: 'user',
        ownerId: String(card.journalist.userId),
        purpose: `card-logo:${card.id}`,
        mimeType: logo.mimeType,
        bytes: logo.bytes,
        ownerKey: profile,
      });
      cardLogoPath = `/media/${copyId}`;
    }
    const secret = {
      cardNumber: card.cardNumber,
      position: card.position,
      positionEn: card.positionEn,
      issueDate: card.issueDate!.toISOString(),
      expireDate: card.expireDate!.toISOString(),
      editorialSnapshot: editorialData
        ? {
            name: editorialData.name,
            displayNameUk: editorialData.displayNameUk,
            displayNameEn: editorialData.displayNameEn,
            mediaId: editorialData.mediaId,
            website: editorialData.website,
            logoPath: cardLogoPath,
          }
        : null,
    };
    await prisma.card.update({
      where: { id: card.id },
      data: {
        encryptedData: payloads.encrypt(
          'card',
          card.id,
          `user:${card.journalist.userId}`,
          secret,
          profile,
        ),
        cardNumberBlindIndex: blind.value('card-number', card.cardNumber),
        cardNumber: `encrypted:${card.uuid}`,
        position: '',
        positionEn: '',
        issueDate: null,
        expireDate: null,
      },
    });
  }

  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  if (settings && !settings.encryptedData) {
    const logo = await encryptedLegacyFile(
      settings.nszhuLogoPath,
      'system',
      '1',
      'nszhu-logo',
      systemKey,
    );
    await prisma.appSetting.update({
      where: { id: 1 },
      data: {
        encryptedData: payloads.encrypt(
          'settings',
          1,
          'system:1',
          { resendApiKey: settings.resendApiKey, mailFrom: settings.mailFrom, nszhuLogoPath: logo },
          systemKey,
        ),
        resendApiKey: null,
        mailFrom: null,
        nszhuLogoPath: null,
      },
    });
  }
  for (const template of await prisma.cardTemplate.findMany()) {
    if (template.encryptedData) continue;
    const key = template.editorialId ? editorialKeys.get(template.editorialId) : systemKey;
    if (!key) throw new Error('Missing template owner key');
    const owner = template.editorialId ? `editorial:${template.editorialId}` : 'system:1';
    await prisma.cardTemplate.update({
      where: { id: template.id },
      data: {
        encryptedData: payloads.encrypt(
          'card-template',
          template.editorialId ?? 1,
          owner,
          { template: template.data },
          key,
        ),
        data: {},
      },
    });
  }
  for (const verification of await prisma.emailVerification.findMany())
    if (!verification.code.startsWith('v1:'))
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { code: blind.verificationCode(verification.userId, verification.code) },
      });

  const output =
    process.env.RECOVERY_KIT_OUTPUT ??
    `presspass-recovery-kits-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  if (kits.length || recoveryOnlyUsers.length || adminEnrollmentPassphrases.length) {
    await writeFile(
      output,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          recoveryOnlyUsers,
          adminEnrollmentPassphrases,
          kits,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    await chmod(output, 0o600);
    console.log(
      `One-time recovery kits written to ${output}; move offline and securely delete this copy.`,
    );
  }
  if (recoveryOnlyUsers.length)
    console.warn(`Users requiring Superadmin recovery enrollment: ${recoveryOnlyUsers.join(', ')}`);
  console.log('Security backfill completed');
  adminKey.fill(0);
  systemKey.fill(0);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const key of userKeys.values()) key.fill(0);
    for (const key of editorialKeys.values()) key.fill(0);
    await prisma.$disconnect();
  });
