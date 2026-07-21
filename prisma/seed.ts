/**
 * Database seed script.
 *
 * Creates the initial administrator account (credentials come from
 * ADMIN_EMAIL / ADMIN_PASSWORD environment variables) and, in non-production
 * environments, a demo journalist with an active card.
 *
 * Usage: npm run db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from '../apps/api/src/crypto/blind-index.service';
import { DataEncryptionService } from '../apps/api/src/crypto/data-encryption.service';
import { ProtectedDataService } from '../apps/api/src/crypto/protected-data.service';
import { UserKeyMaterialService } from '../apps/api/src/crypto/user-key-material.service';
import { KeyHierarchyService } from '../apps/api/src/crypto/key-hierarchy.service';
import type { PrismaService } from '../apps/api/src/prisma/prisma.service';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@presspass.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin1!';
  const adminEncryptionPassphrase = process.env.ADMIN_ENCRYPTION_PASSPHRASE;
  const config = new ConfigService(process.env);
  const blind = new BlindIndexService(config);
  const normalizedEmail = blind.normalizeEmail(adminEmail);
  const emailIndex = blind.email(normalizedEmail);
  let admin = await prisma.user.findFirst({
    where: { emailBlindIndex: emailIndex },
  });
  if (!admin)
    admin = await prisma.user.create({
      data: {
        emailBlindIndex: emailIndex,
        passwordHash: await argon2.hash(adminPassword),
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
  const encryption = new DataEncryptionService();
  const protectedData = new ProtectedDataService(encryption);
  const userKeys = new UserKeyMaterialService(encryption, config, protectedData);
  if (!admin.dataKeyEnvelope) {
    const material = await userKeys.provision(admin.id, adminPassword, { email: normalizedEmail });
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        ...material,
        // Re-derive the login hash from the SAME password used to wrap the data
        // key. Otherwise a row created in one run (hash from password A) but
        // provisioned in a later run (data key from password B) would keep a
        // stale hash and reject the credentials the installer printed.
        passwordHash: await argon2.hash(adminPassword),
        emailBlindIndex: emailIndex,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
  }
  const hierarchy = new KeyHierarchyService(prisma as unknown as PrismaService, encryption);
  if (!(await prisma.adminKeyMaterial.findUnique({ where: { userId: admin.id } }))) {
    if (!adminEncryptionPassphrase || adminEncryptionPassphrase.length < 12)
      throw new Error(
        'ADMIN_ENCRYPTION_PASSPHRASE (min 12 chars) is required for initial key enrollment',
      );
    const adminKey = await hierarchy.enrollAdmin(admin.id, adminEncryptionPassphrase);
    try {
      if (!(await prisma.systemKeyMaterial.findUnique({ where: { id: 1 } }))) {
        const systemKey = await hierarchy.provisionSystemForFirstAdmin(admin.id, adminKey);
        systemKey.fill(0);
      }
    } finally {
      adminKey.fill(0);
    }
  }
  console.log('Initial administrator encrypted key material is ready');

  // Каталог посад (укр./англ.) — заповнюємо один раз, якщо таблиця порожня.
  if ((await prisma.position.count()) === 0) {
    await prisma.position.createMany({
      data: [
        { nameUk: 'Кореспондент', nameEn: 'Correspondent' },
        { nameUk: 'Спеціальний кореспондент', nameEn: 'Special correspondent' },
        { nameUk: 'Фотокореспондент', nameEn: 'Photo correspondent' },
        { nameUk: 'Відеооператор', nameEn: 'Cameraperson' },
        { nameUk: 'Репортер', nameEn: 'Reporter' },
        { nameUk: 'Редактор', nameEn: 'Editor' },
        { nameUk: 'Головний редактор', nameEn: 'Editor-in-chief' },
        { nameUk: 'Оглядач', nameEn: 'Columnist' },
        { nameUk: 'Журналіст', nameEn: 'Journalist' },
        { nameUk: 'Ведучий', nameEn: 'Anchor' },
        { nameUk: 'Продюсер', nameEn: 'Producer' },
        { nameUk: 'Блогер', nameEn: 'Blogger' },
      ],
    });
    console.log('Positions catalogue seeded');
  }

  // Demo identities are intentionally not seeded: meaningful data must never be plaintext.
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
