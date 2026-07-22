import { Module } from '@nestjs/common';

import { CryptoModule } from '../crypto/crypto.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [CryptoModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
