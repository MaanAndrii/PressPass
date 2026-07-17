import { CryptoModule } from '../crypto/crypto.module';

import { Module } from '@nestjs/common';

import { EditorialsController } from './editorials.controller';
import { EditorialsService } from './editorials.service';

@Module({
  imports: [CryptoModule],
  controllers: [EditorialsController],
  providers: [EditorialsService],
})
export class EditorialsModule {}
