import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [CryptoModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
