import { Module } from '@nestjs/common';

import { DataEncryptionService } from './data-encryption.service';
import { BlindIndexService } from './blind-index.service';
import { KeyHierarchyService } from './key-hierarchy.service';
import { UnlockSessionService } from './unlock-session.service';
import { ProtectedDataService } from './protected-data.service';
import { EncryptedFileService } from './encrypted-file.service';
import { EncryptionAccessService } from './encryption-access.service';
import { EncryptionAccessController } from './encryption-access.controller';
import { DomainPayloadService } from './domain-payload.service';
import { EncryptedMediaController } from './encrypted-media.controller';
import { PublicMediaController } from './public-media.controller';
import { PublicMediaCacheService } from './public-media-cache.service';
import { EditorialKeyGrantService } from './editorial-key-grant.service';
import { UserKeyMaterialService } from './user-key-material.service';

@Module({
  controllers: [EncryptionAccessController, EncryptedMediaController, PublicMediaController],
  providers: [
    DataEncryptionService,
    ProtectedDataService,
    DomainPayloadService,
    EncryptedFileService,
    PublicMediaCacheService,
    EncryptionAccessService,
    BlindIndexService,
    KeyHierarchyService,
    UnlockSessionService,
    UserKeyMaterialService,
    EditorialKeyGrantService,
  ],
  exports: [
    DataEncryptionService,
    ProtectedDataService,
    DomainPayloadService,
    EncryptedFileService,
    PublicMediaCacheService,
    EncryptionAccessService,
    BlindIndexService,
    KeyHierarchyService,
    UnlockSessionService,
    UserKeyMaterialService,
    EditorialKeyGrantService,
  ],
})
export class CryptoModule {}
