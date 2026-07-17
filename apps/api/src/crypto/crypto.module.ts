import { Module } from '@nestjs/common';

import { DataEncryptionService } from './data-encryption.service';
import { EditorialKeyGrantService } from './editorial-key-grant.service';
import { UserKeyMaterialService } from './user-key-material.service';

@Module({
  providers: [DataEncryptionService, UserKeyMaterialService, EditorialKeyGrantService],
  exports: [DataEncryptionService, UserKeyMaterialService, EditorialKeyGrantService],
})
export class CryptoModule {}
