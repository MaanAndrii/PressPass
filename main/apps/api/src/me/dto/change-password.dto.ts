import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** PUT /me/password — change the authenticated user's password. */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Поточний пароль' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, description: 'Новий пароль' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
