import { Global, Module } from '@nestjs/common';

import { QrTokenService } from './qr-token.service';

@Global()
@Module({
  providers: [QrTokenService],
  exports: [QrTokenService],
})
export class QrTokenModule {}
