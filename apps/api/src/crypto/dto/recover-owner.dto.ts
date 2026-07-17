import { IsString, MinLength } from 'class-validator';
export class RecoverOwnerDto {
  @IsString() ownerId!: string;
  @IsString() recoveryKit!: string;
  @IsString() @MinLength(12) recoveryPassphrase!: string;
  @IsString() @MinLength(12) newOwnerPassphrase!: string;
}
