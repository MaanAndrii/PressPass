/**
 * DESTRUCTIVE recovery tool: re-provision a user's profile data key from
 * scratch under a known password when the current password is lost and no
 * offline recovery kit is being used.
 *
 * This DISCARDS the old profile data key. Any field encrypted with it that is
 * not re-supplied here is lost. It only re-encrypts the account email (which is
 * known), so it is safe for an administrator account whose sole encrypted
 * profile field is its own email. It is NOT safe for a journalist profile that
 * holds encrypted personal data — the script refuses that case unless
 * ALLOW_JOURNALIST_DATA_LOSS=yes is set explicitly.
 *
 * The account's Admin KEK (unlocked by the separate encryption passphrase) is
 * NOT touched, so system/editorial encryption keeps working.
 *
 * Usage (on the server, from the repo root):
 *   CONFIRM_REPROVISION=yes RESET_EMAIL='admin@example.ua' NEW_PASSWORD='the-password' \
 *     npx tsx --env-file-if-exists=.env prisma/force-reprovision-user.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { BlindIndexService } from '../apps/api/src/crypto/blind-index.service';
import { DataEncryptionService } from '../apps/api/src/crypto/data-encryption.service';
import { ProtectedDataService } from '../apps/api/src/crypto/protected-data.service';
import { UserKeyMaterialService } from '../apps/api/src/crypto/user-key-material.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.CONFIRM_REPROVISION !== 'yes') {
    throw new Error('Refusing to run: set CONFIRM_REPROVISION=yes to acknowledge data-key reset.');
  }
  const email = process.env.RESET_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
  const newPassword = process.env.NEW_PASSWORD ?? '';
  if (!email) throw new Error('Set RESET_EMAIL (or ADMIN_EMAIL).');
  if (newPassword.length < 8) throw new Error('Set NEW_PASSWORD (at least 8 characters).');

  const config = new ConfigService(process.env);
  const blind = new BlindIndexService(config);
  const normalizedEmail = blind.normalizeEmail(email);
  const index = blind.email(normalizedEmail);
  const user = await prisma.user.findFirst({
    where: { OR: [{ emailBlindIndex: index }, { email: normalizedEmail }] },
    include: { journalist: true },
  });
  if (!user) throw new Error('Account not found for that email.');

  if (user.journalist?.encryptedData && process.env.ALLOW_JOURNALIST_DATA_LOSS !== 'yes') {
    throw new Error(
      `User ${user.id} has an encrypted journalist profile. Re-provisioning would lose that ` +
        'data. Set ALLOW_JOURNALIST_DATA_LOSS=yes only if you accept losing it.',
    );
  }

  const encryption = new DataEncryptionService();
  const protectedData = new ProtectedDataService(encryption);
  const userKeys = new UserKeyMaterialService(encryption, config, protectedData);

  // Fresh random data key, wrapped by the new password; re-encrypt the known email.
  const material = await userKeys.provision(user.id, newPassword, { email: normalizedEmail });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(newPassword),
      email: index,
      emailBlindIndex: index,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      tokenVersion: { increment: 1 },
      passwordKdf: material.passwordKdf,
      dataKeyEnvelope: material.dataKeyEnvelope,
      encryptedData: material.encryptedData ?? Prisma.JsonNull,
      // The old profile recovery envelope no longer matches the new data key.
      recoveryKeyEnvelope: Prisma.DbNull,
    },
  });

  console.log(`Re-provisioned profile key for user ${user.id}. Log in with NEW_PASSWORD.`);
  console.log('Existing sessions were revoked. The admin encryption passphrase is unchanged.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
