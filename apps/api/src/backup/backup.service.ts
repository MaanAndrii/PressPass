import { spawn } from 'child_process';
import { copyFile, mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { Readable } from 'stream';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { UnlockSessionService } from '../crypto/unlock-session.service';

/** age-encryption is ESM-only; keep the dynamic import from being downlevelled
 *  to require() by the CommonJS compiler. */
const importAge = new Function('return import("age-encryption")') as () => Promise<
  typeof import('age-encryption')
>;

const MIN_PASSPHRASE = 12;

export interface BackupStream {
  filename: string;
  stream: Readable;
}

/**
 * Produces a single encrypted disaster-recovery archive on demand. The archive
 * bundles a PostgreSQL dump, the encrypted uploads and the server `.env`, and is
 * streamed through age (passphrase) so nothing large is buffered in memory and
 * the file can later be decrypted with the standard `age` CLI.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: UnlockSessionService,
  ) {}

  /** Requires an active Superadmin unlock session, so a stolen access token
   *  alone cannot export the whole database. */
  assertUnlocked(userId: number, token?: string): void {
    if (!token) throw new BadRequestException('Encryption unlock required');
    try {
      this.sessions.key(token, userId, 'system').fill(0);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
  }

  async createBackup(passphrase: string): Promise<BackupStream> {
    if (!passphrase || passphrase.length < MIN_PASSPHRASE)
      throw new BadRequestException(
        `Backup passphrase must be at least ${MIN_PASSPHRASE} characters`,
      );
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) throw new BadRequestException('DATABASE_URL is not configured');
    const uploadsDir = path.resolve(process.cwd(), this.config.get('UPLOADS_DIR', './uploads'));
    const envPath = path.resolve(process.cwd(), '.env');

    const work = await mkdtemp(path.join(tmpdir(), 'presspass-backup-'));
    try {
      // 1. Database dump (custom format) — written fully before we start streaming
      //    so a pg_dump failure surfaces as an error, not a truncated download.
      await this.pgDump(databaseUrl, path.join(work, 'db.dump'));

      // 2. Manifest with just enough to sanity-check a restore.
      const [users, journalists, editorials, cards] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.journalist.count(),
        this.prisma.editorial.count(),
        this.prisma.card.count(),
      ]);
      await writeFile(
        path.join(work, 'manifest.json'),
        JSON.stringify(
          {
            format: 'presspass-backup/1',
            createdAt: new Date().toISOString(),
            counts: { users, journalists, editorials, cards },
            includesEnv: await this.exists(envPath),
            includesUploads: await this.exists(path.join(uploadsDir, 'encrypted')),
          },
          null,
          2,
        ),
      );

      // 3. Copy the server secrets into the bundle (renamed so it never looks
      //    like a live .env). The archive as a whole is age-encrypted.
      if (await this.exists(envPath)) await this.copy(envPath, path.join(work, 'env'));

      // 4. tar (streaming) the small generated files plus the encrypted uploads
      //    tree, without an intermediate copy of potentially-large uploads.
      const tarArgs = ['-cf', '-', '-C', work, '.'];
      if (await this.exists(path.join(uploadsDir, 'encrypted')))
        tarArgs.push('-C', uploadsDir, 'encrypted');
      const tar = spawn('tar', tarArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      tar.stderr.on('data', (chunk) => this.logger.warn(`tar: ${String(chunk).trim()}`));
      tar.on('error', (error) => this.logger.error(`tar failed: ${error.message}`));

      // 5. Encrypt the tar stream with age (passphrase, scrypt).
      const age = await importAge();
      const encrypter = new age.Encrypter();
      encrypter.setPassphrase(passphrase);
      const encrypted = await encrypter.encrypt(
        Readable.toWeb(tar.stdout) as ReadableStream<Uint8Array>,
      );
      const stream = Readable.fromWeb(encrypted as import('stream/web').ReadableStream<Uint8Array>);

      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const filename = `presspass-backup-${stamp}.tar.age`;
      const cleanup = () => void rm(work, { recursive: true, force: true });
      stream.once('close', cleanup);
      stream.once('error', cleanup);
      return { filename, stream };
    } catch (error) {
      await rm(work, { recursive: true, force: true });
      throw error;
    }
  }

  /** Strips Prisma-only query params (e.g. `schema`, `connection_limit`) that
   *  libpq/pg_dump reject, keeping standard connection options intact. */
  private toLibpqUrl(databaseUrl: string): string {
    try {
      const url = new URL(databaseUrl);
      for (const param of [
        'schema',
        'connection_limit',
        'pool_timeout',
        'pgbouncer',
        'socket_timeout',
        'statement_cache_size',
      ])
        url.searchParams.delete(param);
      return url.toString();
    } catch {
      return databaseUrl;
    }
  }

  private pgDump(databaseUrl: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        'pg_dump',
        [this.toLibpqUrl(databaseUrl), '-Fc', '--no-owner', '-f', outPath],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let stderr = '';
      proc.stderr.on('data', (chunk) => (stderr += String(chunk)));
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new BadRequestException(`pg_dump failed (${code}): ${stderr.trim()}`)),
      );
    });
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private copy(from: string, to: string): Promise<void> {
    return copyFile(from, to);
  }
}
