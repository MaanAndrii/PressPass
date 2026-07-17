import { readFile, readdir } from 'fs/promises';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();
async function filesIn(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name !== '.gitkeep');
  } catch {
    return [];
  }
}
async function main(): Promise<void> {
  const failures: string[] = [];
  if (
    await prisma.user.count({
      where: {
        OR: [
          { encryptedData: { equals: Prisma.DbNull } },
          { emailBlindIndex: null },
          { email: { contains: '@' } },
          { AND: [{ googleId: { not: null } }, { googleIdBlindIndex: null }] },
          { NOT: { recoveryKeyEnvelope: { equals: Prisma.DbNull } } },
        ],
      },
    })
  )
    failures.push('users contain plaintext/unmigrated records or legacy server recovery envelopes');
  if (
    await prisma.journalist.count({
      where: {
        OR: [
          { encryptedData: { equals: Prisma.DbNull } },
          { fullName: { not: '' } },
          { fullNameEn: { not: '' } },
          { position: { not: '' } },
          { positionEn: { not: '' } },
          { organization: { not: '' } },
          { organizationEn: { not: '' } },
          { birthDate: { not: null } },
          { passportData: { not: null } },
          { taxNumber: { not: null } },
          { phone: { not: null } },
          { photoPath: { not: null } },
          { nszhuMember: true },
        ],
      },
    })
  )
    failures.push('journalists contain plaintext fields');
  if (
    await prisma.editorial.count({
      where: {
        OR: [
          { encryptedData: { equals: Prisma.DbNull } },
          { name: { not: '' } },
          { displayNameUk: { not: '' } },
          { displayNameEn: { not: '' } },
          { mediaId: { not: '' } },
          { cardNumberPrefix: { not: '' } },
          { cardNumberTemplate: { not: '{prefix}-{year}-{seq:6}' } },
          { edrpou: { not: '' } },
          { website: { not: '' } },
          { director: { not: '' } },
          { email: { not: '' } },
          { address: { not: '' } },
          { phone: { not: '' } },
          { logoPath: { not: null } },
        ],
      },
    })
  )
    failures.push('editorials contain plaintext fields');
  if (
    await prisma.card.count({
      where: {
        OR: [
          { encryptedData: { equals: Prisma.DbNull } },
          { cardNumberBlindIndex: null },
          { cardNumber: { not: { startsWith: 'encrypted:' } } },
          { position: { not: '' } },
          { positionEn: { not: '' } },
          { issueDate: { not: null } },
          { expireDate: { not: null } },
        ],
      },
    })
  )
    failures.push('cards contain plaintext fields');
  if (
    await prisma.appSetting.count({
      where: {
        OR: [
          { encryptedData: { equals: Prisma.DbNull } },
          { resendApiKey: { not: null } },
          { mailFrom: { not: null } },
          { nszhuLogoPath: { not: null } },
        ],
      },
    })
  )
    failures.push('settings contain plaintext fields');
  for (const template of await prisma.cardTemplate.findMany({
    select: { id: true, data: true, encryptedData: true },
  }))
    if (!template.encryptedData || JSON.stringify(template.data) !== '{}')
      failures.push(`card template ${template.id} contains plaintext or is not encrypted`);
  for (const item of await prisma.emailVerification.findMany({ select: { id: true, code: true } }))
    if (!/^v1:[A-Za-z0-9_-]{43}$/.test(item.code))
      failures.push(`email verification ${item.id} is plaintext`);
  if ((await prisma.superadminRecoveryKey.count({ where: { revokedAt: null } })) < 2)
    failures.push('fewer than two active Superadmin recovery authorities');
  for (const user of await prisma.user.findMany({ select: { id: true } }))
    if (
      (await prisma.superadminKeySlot.count({
        where: { ownerType: 'user', ownerId: String(user.id), revokedAt: null },
      })) !== 2
    )
      failures.push(`user ${user.id} does not have two recovery slots`);
  for (const editorial of await prisma.editorial.findMany({ select: { id: true } }))
    if (
      (await prisma.superadminKeySlot.count({
        where: { ownerType: 'editorial', ownerId: String(editorial.id), revokedAt: null },
      })) !== 2
    )
      failures.push(`editorial ${editorial.id} does not have two recovery slots`);
  for (const membership of await prisma.editorialMembership.findMany({
    select: { editorialId: true, journalist: { select: { userId: true } } },
  }))
    if (
      !(await prisma.editorialDataKeyGrant.findUnique({
        where: {
          userId_editorialId: {
            userId: membership.journalist.userId,
            editorialId: membership.editorialId,
          },
        },
      }))
    )
      failures.push(
        `membership user ${membership.journalist.userId}/editorial ${membership.editorialId} has no encrypted key grant`,
      );
  for (const admin of await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'EDITORIAL_ADMIN'] } },
    select: { id: true, role: true, editorialId: true, adminKeyMaterial: { select: { id: true } } },
  })) {
    if (!admin.adminKeyMaterial) {
      failures.push(`administrator ${admin.id} has no passphrase-wrapped Admin KEK`);
      continue;
    }
    if (
      admin.role === 'ADMIN' &&
      !(await prisma.systemAdminKeySlot.findUnique({
        where: {
          systemKeyId_adminKeyId: { systemKeyId: 1, adminKeyId: admin.adminKeyMaterial.id },
        },
      }))
    )
      failures.push(`Superadmin ${admin.id} has no wrapped System KEK`);
    if (admin.editorialId) {
      const editorialKey = await prisma.editorialKeyMaterial.findUnique({
        where: { editorialId: admin.editorialId },
      });
      if (
        !editorialKey ||
        !(await prisma.editorialAdminKeySlot.findUnique({
          where: {
            editorialKeyId_adminKeyId: {
              editorialKeyId: editorialKey.id,
              adminKeyId: admin.adminKeyMaterial.id,
            },
          },
        }))
      )
        failures.push(`administrator ${admin.id} has no wrapped key for its editorial`);
    }
  }
  if (
    (await prisma.superadminKeySlot.count({
      where: { ownerType: 'system', ownerId: '1', revokedAt: null },
    })) !== 2
  )
    failures.push('system key does not have two recovery slots');
  const base = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? './uploads');
  for (const legacy of ['photos', 'branding']) {
    const names = await filesIn(path.join(base, legacy));
    if (names.length)
      failures.push(`${legacy} still contains plaintext files: ${names.join(', ')}`);
  }
  const encryptedDirectory = path.join(base, 'encrypted');
  const encryptedNames = await filesIn(encryptedDirectory);
  const records = await prisma.encryptedFile.findMany({
    select: { id: true, storageName: true },
  });
  const expectedNames = new Set(records.map((record) => record.storageName));
  for (const record of records) {
    if (!/^[0-9a-f-]{36}\.ppenc$/i.test(record.storageName)) {
      failures.push(`encrypted file ${record.id} has an unsafe storage name`);
      continue;
    }
    try {
      const envelope = JSON.parse(
        await readFile(path.join(encryptedDirectory, record.storageName), 'utf8'),
      ) as { version?: number; algorithm?: string; ciphertext?: string };
      if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' || !envelope.ciphertext)
        failures.push(`encrypted file ${record.id} is not a supported ciphertext envelope`);
    } catch {
      failures.push(`encrypted file ${record.id} is missing, plaintext or malformed`);
    }
  }
  for (const name of encryptedNames)
    if (!expectedNames.has(name)) failures.push(`orphan encrypted file exists: ${name}`);
  if (failures.length) throw new Error(`Security verification failed:\n- ${failures.join('\n- ')}`);
  console.log('Security verification passed: no legacy plaintext records or uploads found.');
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
