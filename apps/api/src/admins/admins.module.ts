import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

@Module({
  imports: [CryptoModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
