import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    example: 're_xxxxxxxx',
    description: 'Resend API key; порожній рядок очищає (повертає до env)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resendApiKey?: string;

  @ApiPropertyOptional({ example: 'PressPass <no-reply@domain.ua>' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mailFrom?: string;

  @ApiPropertyOptional({
    example: '1234567890-abc.apps.googleusercontent.com',
    description: 'Google OAuth client id; порожній рядок очищає (повертає до env)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  googleClientId?: string;

  @ApiPropertyOptional({
    description: 'Google OAuth client secret; порожній рядок очищає (повертає до env)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  googleClientSecret?: string;
}
