import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Shared multer options for journalist photo uploads (admin and self-service):
 * JPEG/PNG/WebP up to 5 MB, held in memory until encrypted-file storage accepts it.
 */
export const photoMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: PHOTO_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_EXTENSIONS[file.mimetype]) {
      cb(new BadRequestException('Only JPEG, PNG or WebP images are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
