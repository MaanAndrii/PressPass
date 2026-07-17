/**
 * Read-only login diagnostic.
 *
 * Explains WHY `POST /auth/login` returns "Invalid email or password" for a
 * given account on a real deployment, without printing any secret value. It
 * reproduces the exact steps of AuthService.login against the live database
 * and reports which one fails.
 *
 * Usage (on the server, from the repo root):
 *   DIAG_EMAIL='admin@example.ua' DIAG_PASSWORD='the-password' \
 *     npx tsx --env-file-if-exists=.env prisma/diagnose-login.ts
 *
 * DIAG_EMAIL defaults to ADMIN_EMAIL from the environment.
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { BlindIndexService } from '../apps/api/src/crypto/blind-index.service';
import { DataEncryptionService } from '../apps/api/src/crypto/data-encryption.service';
import { ProtectedDataService } from '../apps/api/src/crypto/protected-data.service';
import { UserKeyMaterialService } from '../apps/api/src/crypto/user-key-material.service';

const prisma = new PrismaClient();

function mark(ok: boolean): string {
  return ok ? 'OK' : 'FAIL';
}

async function main(): Promise<void> {
  const email = process.env.DIAG_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
  const password = process.env.DIAG_PASSWORD ?? '';
  if (!email) throw new Error('Set DIAG_EMAIL (or ADMIN_EMAIL).');
  if (!password) throw new Error('Set DIAG_PASSWORD.');

  const config = new ConfigService(process.env);
  const lookupBytes = Buffer.byteLength(config.get<string>('LOOKUP_KEY') ?? '', 'utf8');
  const dataSecretLen = (config.get<string>('DATA_KEY_SECRET') ?? '').length;
  console.log('--- environment ---');
  console.log(`LOOKUP_KEY bytes:      ${lookupBytes} (need >= 32)`);
  console.log(`DATA_KEY_SECRET chars: ${dataSecretLen} (need >= 32)`);

  const blind = new BlindIndexService(config);
  let computedIndex: string | undefined;
  try {
    computedIndex = blind.email(email);
    console.log('email blind index:     computed');
  } catch (error) {
    console.log(`email blind index:     ERROR — ${(error as Error).message}`);
  }

  console.log('\n--- account lookup ---');
  // Same lookup as AuthService.login.
  const byLogin = computedIndex
    ? await prisma.user.findFirst({
        where: { OR: [{ emailBlindIndex: computedIndex }, { email: email.toLowerCase().trim() }] },
      })
    : await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } });
  // Also fetch the first ADMIN regardless of index, to detect a key mismatch.
  const adminRow = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  console.log(`found by login lookup: ${mark(Boolean(byLogin))}`);
  if (adminRow) {
    const storedIsHashed = !adminRow.email.includes('@');
    const indexMatches = computedIndex ? adminRow.emailBlindIndex === computedIndex : false;
    console.log(`first ADMIN id:        ${adminRow.id}`);
    console.log(
      `stored email column:   ${storedIsHashed ? 'hashed (v1:...)' : 'PLAINTEXT with @'}`,
    );
    console.log(`emailBlindIndex set:   ${mark(Boolean(adminRow.emailBlindIndex))}`);
    console.log(
      `index matches account: ${mark(indexMatches)}` +
        (indexMatches ? '' : '  <-- LOOKUP_KEY changed since seed, or different email'),
    );
    console.log(
      `emailVerifiedAt:       ${adminRow.emailVerifiedAt ? 'set' : 'NULL (blocks login)'}`,
    );
    console.log(`passwordHash present:  ${mark(Boolean(adminRow.passwordHash))}`);
    console.log(`passwordKdf present:   ${mark(adminRow.passwordKdf != null)}`);
    console.log(`dataKeyEnvelope pres.: ${mark(adminRow.dataKeyEnvelope != null)}`);
  }

  const user = byLogin ?? adminRow;
  if (!user) {
    console.log('\nResult: account not found at all. Wrong DATABASE_URL or empty DB.');
    return;
  }

  console.log('\n--- credential checks (against the account above) ---');
  if (!user.passwordHash) {
    console.log('passwordHash:          missing -> login always fails (Google-only row?)');
    return;
  }
  const passwordValid = await argon2.verify(user.passwordHash, password);
  console.log(`argon2 password verify: ${mark(passwordValid)}`);

  if (user.passwordKdf != null && user.dataKeyEnvelope != null) {
    const encryption = new DataEncryptionService();
    const protectedData = new ProtectedDataService(encryption);
    const userKeys = new UserKeyMaterialService(encryption, config, protectedData);
    try {
      const key = await userKeys.unlock(user.id, password, user.passwordKdf, user.dataKeyEnvelope);
      key.fill(0);
      console.log('data key unlock:        OK');
    } catch (error) {
      console.log(`data key unlock:        FAIL — ${(error as Error).message}`);
    }
  } else {
    console.log('data key unlock:        skipped (kdf/envelope not both present)');
  }

  console.log('\n--- verdict ---');
  if (!byLogin) {
    console.log('Login lookup does not find this account: fix the blind index / LOOKUP_KEY.');
  } else if (!passwordValid) {
    console.log('The supplied password does not match the stored hash: wrong password.');
  } else if (!user.emailVerifiedAt) {
    console.log('Password is correct but the account is not email-verified.');
  } else {
    console.log(
      'Password and lookup are correct. If the app still rejects it, check unlock above.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
