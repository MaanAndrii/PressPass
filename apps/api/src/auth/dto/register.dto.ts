import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'me@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'me@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: '6-значний код із листа' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResendCodeDto {
  @ApiProperty({ example: 'me@example.com' })
  @IsEmail()
  email!: string;
}
