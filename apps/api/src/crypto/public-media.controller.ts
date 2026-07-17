import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import type { Response } from 'express';
import { PublicMediaCacheService } from './public-media-cache.service';
@Controller('public-media')
export class PublicMediaController {
  constructor(private readonly cache: PublicMediaCacheService) {}
  @Public() @Get(':id') get(@Param('id') id: string, @Res() response: Response): void {
    const item = this.cache.take(id);
    if (!item) throw new NotFoundException('Media projection expired');
    response.setHeader('Content-Type', item.mimeType);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(item.bytes);
  }
}
