import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { JournalistsController } from './journalists.controller';
import { JournalistsService } from './journalists.service';

@Module({
  imports: [CryptoModule],
  controllers: [JournalistsController],
  providers: [JournalistsService],
})
export class JournalistsModule {}
