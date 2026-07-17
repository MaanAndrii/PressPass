import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateJournalistDto {
  @ApiPropertyOptional({ example: 'journalist@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'New password (resets the current one)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ example: 'Іван Петренко' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ example: 'Ivan Petrenko', description: 'ПІП латиницею (для картки)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullNameEn?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'КВ 123456, виданий …' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  passportData?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'ІПН має складатися з 10 цифр' })
  taxNumber?: string;

  @ApiPropertyOptional({ example: '+380501234567' })
  @IsOptional()
  @Matches(/^\+?[\d\s()-]{10,20}$/, { message: 'Невірний формат номера телефону' })
  phone?: string;

  @ApiPropertyOptional({ example: false, description: 'Член НСЖУ' })
  @IsOptional()
  @IsBoolean()
  nszhuMember?: boolean;
}
