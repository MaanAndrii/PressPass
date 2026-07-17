import { IsString, MinLength } from 'class-validator';
export class ChangeEncryptionPassphraseDto {
  @IsString() @MinLength(12) currentPassphrase!: string;
  @IsString() @MinLength(12) newPassphrase!: string;
}
