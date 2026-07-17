import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [CryptoModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
