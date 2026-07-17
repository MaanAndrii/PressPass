import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';

import type { Argon2idDescriptorV1, EncryptedEnvelopeV1, EncryptionContext } from './crypto.types';
import { DataEncryptionService } from './data-encryption.service';
import { ProtectedDataService } from './protected-data.service';

export interface PersistedUserKeyMaterial {
  passwordKdf: Prisma.InputJsonValue;
  dataKeyEnvelope: Prisma.InputJsonValue;
  recoveryKeyEnvelope?: Prisma.InputJsonValue;
  encryptedData?: Prisma.InputJsonValue;
}

@Injectable()
export class UserKeyMaterialService {
  constructor(
    private readonly encryption: DataEncryptionService,
    private readonly config: ConfigService,
    private readonly protectedData: ProtectedDataService,
  ) {}

  async provision(
    userId: number,
    password: string,
    initialData?: Record<string, unknown>,
    onDataKey?: (dataKey: Buffer) => Promise<void>,
  ): Promise<PersistedUserKeyMaterial> {
    const dataKey = this.encryption.generateDataKey();
    const wrapping = await this.encryption.createPasswordWrappingKey(password);
    try {
      const envelope = this.encryption.wrapKey(dataKey, wrapping.key, this.context(userId));
      if (onDataKey) await onDataKey(dataKey);
      return {
        passwordKdf: this.toJson(wrapping.descriptor),
        dataKeyEnvelope: this.toJson(envelope),
        ...(initialData
          ? {
              encryptedData: this.toJson(
                this.protectedData.encrypt(initialData, dataKey, this.payloadContext(userId)),
              ),
            }
          : {}),
      };
    } finally {
      dataKey.fill(0);
      wrapping.key.fill(0);
    }
  }

  async resetWithRecovery(
    userId: number,
    newPassword: string,
    recoveryKeyEnvelope: unknown,
  ): Promise<PersistedUserKeyMaterial> {
    const recoveryKey = this.scopedServerKey(`recovery:user:${userId}`);
    let dataKey: Buffer | undefined;
    let wrapping:
      Awaited<ReturnType<DataEncryptionService['createPasswordWrappingKey']>> | undefined;
    try {
      dataKey = this.encryption.unwrapKey(
        this.readEnvelope(recoveryKeyEnvelope),
        recoveryKey,
        this.recoveryContext(userId),
      );
      wrapping = await this.encryption.createPasswordWrappingKey(newPassword);
      return {
        passwordKdf: this.toJson(wrapping.descriptor),
        dataKeyEnvelope: this.toJson(
          this.encryption.wrapKey(dataKey, wrapping.key, this.context(userId)),
        ),
        recoveryKeyEnvelope: this.toJson(recoveryKeyEnvelope as object),
      };
    } finally {
      recoveryKey.fill(0);
      dataKey?.fill(0);
      wrapping?.key.fill(0);
    }
  }

  recover(userId: number, recoveryKeyEnvelope: unknown): Buffer {
    const recoveryKey = this.scopedServerKey(`recovery:user:${userId}`);
    try {
      return this.encryption.unwrapKey(
        this.readEnvelope(recoveryKeyEnvelope),
        recoveryKey,
        this.recoveryContext(userId),
      );
    } finally {
      recoveryKey.fill(0);
    }
  }

  createEditorialGrant(
    userId: number,
    editorialId: number,
    dataKey: Buffer,
  ): Prisma.InputJsonValue {
    const editorialKey = this.scopedServerKey(`editorial:${editorialId}`);
    try {
      return this.toJson(
        this.encryption.wrapKey(dataKey, editorialKey, this.editorialContext(userId, editorialId)),
      );
    } finally {
      editorialKey.fill(0);
    }
  }

  createRecoveryGrant(userId: number, dataKey: Buffer): Prisma.InputJsonValue {
    const recoveryKey = this.scopedServerKey(`recovery:user:${userId}`);
    try {
      return this.toJson(
        this.encryption.wrapKey(dataKey, recoveryKey, this.recoveryContext(userId)),
      );
    } finally {
      recoveryKey.fill(0);
    }
  }

  async unlock(
    userId: number,
    password: string,
    passwordKdf: unknown,
    dataKeyEnvelope: unknown,
  ): Promise<Buffer> {
    const descriptor = this.readDescriptor(passwordKdf);
    const envelope = this.readEnvelope(dataKeyEnvelope);
    const wrappingKey = await this.encryption.derivePasswordWrappingKey(password, descriptor);
    try {
      return this.encryption.unwrapKey(envelope, wrappingKey, this.context(userId));
    } finally {
      wrappingKey.fill(0);
    }
  }

  async wrapExisting(
    userId: number,
    newPassword: string,
    dataKey: Buffer,
  ): Promise<PersistedUserKeyMaterial> {
    const wrapping = await this.encryption.createPasswordWrappingKey(newPassword);
    try {
      return {
        passwordKdf: this.toJson(wrapping.descriptor),
        dataKeyEnvelope: this.toJson(
          this.encryption.wrapKey(dataKey, wrapping.key, this.context(userId)),
        ),
      };
    } finally {
      wrapping.key.fill(0);
    }
  }

  async rewrap(
    userId: number,
    currentPassword: string,
    newPassword: string,
    passwordKdf: unknown,
    dataKeyEnvelope: unknown,
  ): Promise<PersistedUserKeyMaterial> {
    const dataKey = await this.unlock(userId, currentPassword, passwordKdf, dataKeyEnvelope);
    const newWrapping = await this.encryption.createPasswordWrappingKey(newPassword);
    try {
      const envelope = this.encryption.wrapKey(dataKey, newWrapping.key, this.context(userId));
      return {
        passwordKdf: this.toJson(newWrapping.descriptor),
        dataKeyEnvelope: this.toJson(envelope),
      };
    } finally {
      dataKey.fill(0);
      newWrapping.key.fill(0);
    }
  }

  decryptUserData<T>(userId: number, encryptedData: unknown, dataKey: Buffer): T {
    return this.protectedData.decrypt<T>(encryptedData, dataKey, this.payloadContext(userId));
  }

  encryptUserData(
    userId: number,
    data: Record<string, unknown>,
    dataKey: Buffer,
  ): Prisma.InputJsonValue {
    return this.toJson(this.protectedData.encrypt(data, dataKey, this.payloadContext(userId)));
  }

  private payloadContext(userId: number): EncryptionContext {
    return {
      entity: 'user',
      entityId: String(userId),
      field: 'payload',
      ownerId: `user:${userId}`,
    };
  }

  private context(userId: number): EncryptionContext {
    return {
      entity: 'user',
      entityId: String(userId),
      field: 'profile-data-key',
      ownerId: `user:${userId}`,
    };
  }

  private recoveryContext(userId: number): EncryptionContext {
    return { entity: 'user', entityId: String(userId), field: 'recovery-data-key' };
  }

  private editorialContext(userId: number, editorialId: number): EncryptionContext {
    return {
      entity: 'editorial-grant',
      entityId: `${editorialId}:${userId}`,
      field: 'profile-data-key',
      ownerId: `user:${userId}`,
    };
  }

  private scopedServerKey(scope: string): Buffer {
    const secret =
      this.config.get<string>('DATA_KEY_SECRET') ?? this.config.get<string>('JWT_SECRET') ?? '';
    if (secret.length < 32) {
      throw new Error('DATA_KEY_SECRET or JWT_SECRET must contain at least 32 characters');
    }
    return createHmac('sha256', secret).update(`presspass:${scope}`).digest();
  }

  private readDescriptor(value: unknown): Argon2idDescriptorV1 {
    if (!this.isRecord(value)) {
      throw new Error('Invalid password KDF descriptor');
    }
    return value as unknown as Argon2idDescriptorV1;
  }

  private readEnvelope(value: unknown): EncryptedEnvelopeV1 {
    if (!this.isRecord(value)) {
      throw new Error('Invalid data key envelope');
    }
    return value as unknown as EncryptedEnvelopeV1;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toJson(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
