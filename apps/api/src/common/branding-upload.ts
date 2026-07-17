import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

const LOGO_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
};

/** Multer options for card logo uploads (PNG/WebP/JPEG up to 2 MB). */
export const logoMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: LOGO_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_EXTENSIONS[file.mimetype]) {
      cb(new BadRequestException('Only PNG, WebP or JPEG logos are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
