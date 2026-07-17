import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataEncryptionService } from './data-encryption.service';
import { EncryptedFileService } from './encrypted-file.service';
describe('EncryptedFileService', () => {
  it('writes only ciphertext, authorizes with the owner key and deletes durable bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presspass-file-'));
    let record: any;
    const prisma: any = {
      encryptedFile: {
        create: jest.fn(({ data }: any) => {
          record = data;
          return data;
        }),
        findUnique: jest.fn(() => record),
        delete: jest.fn(() => record),
        findMany: jest.fn(() => []),
      },
    };
    const service = new EncryptedFileService(
      prisma,
      new DataEncryptionService(),
      new ConfigService({ UPLOADS_DIR: root }),
    );
    const owner = Buffer.alloc(32, 8),
      plaintext = Buffer.from('private-photo-bytes');
    const id = await service.store({
      ownerType: 'user',
      ownerId: '4',
      purpose: 'profile-photo',
      mimeType: 'image/png',
      bytes: plaintext,
      ownerKey: owner,
    });
    const durable = await readFile(join(root, 'encrypted', record.storageName), 'utf8');
    expect(durable).not.toContain('private-photo-bytes');
    await expect(service.read(id, Buffer.alloc(32, 9))).rejects.toThrow('Decryption failed');
    await expect(service.read(id, owner)).resolves.toEqual({
      bytes: plaintext,
      mimeType: 'image/png',
    });
    const envelope = JSON.parse(durable);
    envelope.authTag = envelope.authTag.replace(/^./, envelope.authTag[0] === 'A' ? 'B' : 'A');
    await writeFile(join(root, 'encrypted', record.storageName), JSON.stringify(envelope));
    await expect(service.read(id, owner)).rejects.toThrow('Decryption failed');
    await service.remove(id);
    await expect(readFile(join(root, 'encrypted', record.storageName))).rejects.toThrow();
    owner.fill(0);
    await rm(root, { recursive: true, force: true });
  });
});
