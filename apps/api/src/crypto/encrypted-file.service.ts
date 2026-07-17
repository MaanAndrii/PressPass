import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DataEncryptionService } from './data-encryption.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EncryptedFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: DataEncryptionService,
    private readonly config: ConfigService,
  ) {}

  async store(input: {
    ownerType: string;
    ownerId: string;
    purpose: string;
    mimeType: string;
    bytes: Buffer;
    ownerKey: Buffer;
    editorialId?: number;
  }): Promise<string> {
    const id = randomUUID();
    const storageName = `${randomUUID()}.ppenc`;
    const fileKey = this.crypto.generateDataKey();
    const directory = path.resolve(
      process.cwd(),
      this.config.get('UPLOADS_DIR', './uploads'),
      'encrypted',
    );
    const finalPath = path.join(directory, storageName);
    const temporary = `${finalPath}.tmp`;
    const contentContext = {
      entity: 'file',
      entityId: id,
      field: 'content',
      ownerId: `${input.ownerType}:${input.ownerId}`,
    };
    const keyContext = { ...contentContext, field: 'file-key' };
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const content = this.crypto.encrypt(input.bytes, fileKey, contentContext);
      const keyEnvelope = this.crypto.wrapKey(fileKey, input.ownerKey, keyContext);
      await fs.writeFile(temporary, JSON.stringify(content), { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, finalPath);
      await this.prisma.encryptedFile.create({
        data: {
          id,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          editorialId: input.editorialId,
          purpose: input.purpose,
          storageName,
          mimeType: input.mimeType,
          byteLength: input.bytes.length,
          contentEnvelope: this.json({ version: content.version, algorithm: content.algorithm }),
          fileKeyEnvelope: this.json(keyEnvelope),
        },
      });
      return id;
    } catch (error) {
      await fs.rm(temporary, { force: true });
      await fs.rm(finalPath, { force: true });
      throw error;
    } finally {
      fileKey.fill(0);
    }
  }

  metadata(id: string) {
    return this.prisma.encryptedFile.findUnique({ where: { id } });
  }

  async read(id: string, ownerKey: Buffer): Promise<{ bytes: Buffer; mimeType: string }> {
    const record = await this.prisma.encryptedFile.findUnique({ where: { id } });
    if (!record || record.replacedAt) throw new NotFoundException('Encrypted file not found');
    const context = {
      entity: 'file',
      entityId: id,
      field: 'content',
      ownerId: `${record.ownerType}:${record.ownerId}`,
    };
    const fileKey = this.crypto.unwrapKey(record.fileKeyEnvelope as never, ownerKey, {
      ...context,
      field: 'file-key',
    });
    try {
      const filePath = path.resolve(
        process.cwd(),
        this.config.get('UPLOADS_DIR', './uploads'),
        'encrypted',
        record.storageName,
      );
      const envelope = JSON.parse(await fs.readFile(filePath, 'utf8')) as never;
      return { bytes: this.crypto.decrypt(envelope, fileKey, context), mimeType: record.mimeType };
    } finally {
      fileKey.fill(0);
    }
  }

  async removePurpose(ownerType: string, ownerId: string, purpose: string): Promise<void> {
    const files = await this.prisma.encryptedFile.findMany({
      where: { ownerType, ownerId, purpose },
    });
    for (const item of files) await this.remove(item.id);
  }

  async removeOwner(ownerType: string, ownerId: string): Promise<void> {
    const files = await this.prisma.encryptedFile.findMany({ where: { ownerType, ownerId } });
    for (const item of files) await this.remove(item.id);
  }

  async cleanupReplaced(
    ownerType: string,
    ownerId: string,
    purpose: string,
    keepId: string,
  ): Promise<void> {
    const obsolete = await this.prisma.encryptedFile.findMany({
      where: { ownerType, ownerId, purpose, id: { not: keepId } },
    });
    for (const item of obsolete) await this.remove(item.id);
  }

  async remove(id: string): Promise<void> {
    const record = await this.prisma.encryptedFile.delete({ where: { id } });
    const filePath = path.resolve(
      process.cwd(),
      this.config.get('UPLOADS_DIR', './uploads'),
      'encrypted',
      record.storageName,
    );
    await fs.rm(filePath, { force: true });
  }
  private json(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
