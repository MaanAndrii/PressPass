import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function photosDir(): string {
  const base = process.env.UPLOADS_DIR ?? './uploads';
  const dir = path.resolve(process.cwd(), base, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Shared multer options for journalist photo uploads (admin and self-service):
 * JPEG/PNG/WebP up to 5 MB, stored on disk under a random UUID file name.
 */
export const photoMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, photosDir()),
    filename: (_req, file, cb) => {
      const ext = PHOTO_EXTENSIONS[file.mimetype] ?? '.bin';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: PHOTO_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_EXTENSIONS[file.mimetype]) {
      cb(new BadRequestException('Only JPEG, PNG or WebP images are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
