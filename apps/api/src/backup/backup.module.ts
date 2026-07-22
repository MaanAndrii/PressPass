import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [CryptoModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
