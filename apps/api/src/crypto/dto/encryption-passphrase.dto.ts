import { IsString, MinLength } from 'class-validator';
export class EncryptionPassphraseDto {
  @IsString()
  @MinLength(12)
  passphrase!: string;
}
