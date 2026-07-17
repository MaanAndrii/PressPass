import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { EncryptedFileService } from './encrypted-file.service';
import { UnlockSessionService } from './unlock-session.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class EncryptedMediaController {
  constructor(
    private readonly files: EncryptedFileService,
    private readonly sessions: UnlockSessionService,
  ) {}
  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('x-unlock-token') token: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (!token) throw new BadRequestException('Encryption unlock required');
    const metadata = await this.files.metadata(id);
    if (!metadata) throw new NotFoundException('Encrypted file not found');
    let keyName: string;
    if (metadata.ownerType === 'user' && metadata.ownerId === String(user.sub)) keyName = 'profile';
    else if (
      metadata.editorialId &&
      (user.role === 'ADMIN' || user.editorialId === metadata.editorialId)
    )
      keyName = `editorial:${metadata.editorialId}`;
    else throw new NotFoundException('Encrypted file not found');
    let key: Buffer;
    try {
      key = this.sessions.key(token, user.sub, keyName);
    } catch {
      throw new BadRequestException('Encryption unlock required');
    }
    try {
      const file = await this.files.read(id, key);
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'private, no-store, max-age=0');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.send(file.bytes);
    } finally {
      key.fill(0);
    }
  }
}
