import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

const LOGO_EXTENSIONS: Record<string, string> = {
  'image/svg+xml': '.svg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
};

function brandingDir(): string {
  const base = process.env.UPLOADS_DIR ?? './uploads';
  const dir = path.resolve(process.cwd(), base, 'branding');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Multer options for card logo uploads (SVG/PNG/WebP/JPEG up to 2 MB). */
export const logoMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, brandingDir()),
    filename: (_req, file, cb) => {
      const ext = LOGO_EXTENSIONS[file.mimetype] ?? '.bin';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: LOGO_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_EXTENSIONS[file.mimetype]) {
      cb(new BadRequestException('Only SVG, PNG, WebP or JPEG logos are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
