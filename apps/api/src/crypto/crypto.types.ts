export const DATA_KEY_BYTES = 32;
export const GCM_NONCE_BYTES = 12;
export const GCM_TAG_BYTES = 16;

export interface EncryptionContext {
  entity: string;
  entityId: string;
  field: string;
  ownerId?: string;
}

export interface EncryptedEnvelopeV1 {
  version: 1;
  algorithm: 'AES-256-GCM';
  nonce: string;
  ciphertext: string;
  authTag: string;
}

export interface Argon2idDescriptorV1 {
  version: 1;
  algorithm: 'ARGON2ID';
  salt: string;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: 32;
}

export interface DerivedWrappingKey {
  key: Buffer;
  descriptor: Argon2idDescriptorV1;
}
