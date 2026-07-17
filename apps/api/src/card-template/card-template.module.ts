import { CryptoModule } from '../crypto/crypto.module';

import { Module } from '@nestjs/common';

import { CardTemplateController } from './card-template.controller';
import { CardTemplateService } from './card-template.service';

@Module({
  imports: [CryptoModule],
  controllers: [CardTemplateController],
  providers: [CardTemplateService],
})
export class CardTemplateModule {}
