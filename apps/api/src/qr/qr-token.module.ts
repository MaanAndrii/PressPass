import { Global, Module } from '@nestjs/common';

import { QrTokenService } from './qr-token.service';
import { QrProjectionCacheService } from './qr-projection-cache.service';

@Global()
@Module({
  providers: [QrTokenService, QrProjectionCacheService],
  exports: [QrTokenService, QrProjectionCacheService],
})
export class QrTokenModule {}
