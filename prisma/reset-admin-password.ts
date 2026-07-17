/**
 * Reset a login password without losing the encrypted profile data key.
 *
 * Fixes the case where `password_hash` and `data_key_envelope` fell out of
 * sync (e.g. after repeated installs), so the printed password unlocks the
 * data key but is rejected at login.
 *
 * Behaviour:
 *   - If NEW_PASSWORD already unlocks the data key, only the login hash is
 *     rewritten (no rewrap needed).
 *   - Otherwise, if a valid OLD_PASSWORD is supplied, the data key is rewrapped
 *     from OLD_PASSWORD to NEW_PASSWORD and the hash is rewritten.
 *   - If neither unlocks the data key, the script refuses (use recovery).
 *
 * Usage (on the server, from the repo root):
 *   RESET_EMAIL='admin@example.ua' NEW_PASSWORD='the-password' \
 *     npx tsx --env-file-if-exists=.env prisma/reset-admin-password.ts
 *
 * RESET_EMAIL defaults to ADMIN_EMAIL. Add OLD_PASSWORD only if NEW_PASSWORD
 * does not already unlock the data key.
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { BlindIndexService } from '../apps/api/src/crypto/blind-index.service';
import { DataEncryptionService } from '../apps/api/src/crypto/data-encryption.service';
import { ProtectedDataService } from '../apps/api/src/crypto/protected-data.service';
import {
  UserKeyMaterialService,
  type PersistedUserKeyMaterial,
} from '../apps/api/src/crypto/user-key-material.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.RESET_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
  const newPassword = process.env.NEW_PASSWORD ?? '';
  const oldPassword = process.env.OLD_PASSWORD ?? '';
  if (!email) throw new Error('Set RESET_EMAIL (or ADMIN_EMAIL).');
  if (newPassword.length < 8) throw new Error('Set NEW_PASSWORD (at least 8 characters).');

  const config = new ConfigService(process.env);
  const blind = new BlindIndexService(config);
  const index = blind.email(email);
  const user = await prisma.user.findFirst({
    where: { OR: [{ emailBlindIndex: index }, { email: blind.normalizeEmail(email) }] },
  });
  if (!user) throw new Error('Account not found for that email.');

  const encryption = new DataEncryptionService();
  const protectedData = new ProtectedDataService(encryption);
  const userKeys = new UserKeyMaterialService(encryption, config, protectedData);

  let material: PersistedUserKeyMaterial | undefined;
  if (user.passwordKdf != null && user.dataKeyEnvelope != null) {
    const passwordKdf = user.passwordKdf;
    const dataKeyEnvelope = user.dataKeyEnvelope;
    const unlocks = async (pw: string): Promise<boolean> => {
      try {
        const key = await userKeys.unlock(user.id, pw, passwordKdf, dataKeyEnvelope);
        key.fill(0);
        return true;
      } catch {
        return false;
      }
    };
    if (await unlocks(newPassword)) {
      console.log('Data key already matches NEW_PASSWORD; updating the login hash only.');
    } else if (oldPassword && (await unlocks(oldPassword))) {
      console.log('Rewrapping the data key from OLD_PASSWORD to NEW_PASSWORD.');
      material = await userKeys.rewrap(
        user.id,
        oldPassword,
        newPassword,
        passwordKdf,
        dataKeyEnvelope,
      );
    } else {
      throw new Error(
        'NEW_PASSWORD does not unlock the data key and no valid OLD_PASSWORD was given. ' +
          'Use the Superadmin recovery flow instead of this script.',
      );
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(newPassword),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      tokenVersion: { increment: 1 },
      ...(material
        ? { passwordKdf: material.passwordKdf, dataKeyEnvelope: material.dataKeyEnvelope }
        : {}),
    },
  });
  console.log('Done. Log in with NEW_PASSWORD. Existing sessions were revoked.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
