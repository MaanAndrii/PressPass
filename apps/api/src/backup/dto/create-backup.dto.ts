import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateBackupDto {
  @ApiProperty({
    description:
      'Passphrase that encrypts the backup (age/scrypt). Required again to restore. ' +
      'Use a strong passphrase and store it apart from the backup file.',
    minLength: 12,
  })
  @IsString()
  @MinLength(12)
  passphrase!: string;
}
