import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateJournalistDto {
  @ApiProperty({ example: 'journalist@example.com', description: 'Login email for the journalist' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ng_Password!', minLength: 8, description: 'Initial password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Іван Петренко' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Ivan Petrenko', description: 'ПІП латиницею (для картки)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullNameEn?: string;

  // Особові дані (адміністратор може заповнити відразу). Посаду й редакцію
  // журналіст не вказує — їх задає редакція при видачі посвідчення.
  @ApiPropertyOptional({ example: '1990-05-15', description: 'Дата народження' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'КВ 123456, виданий …' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  passportData?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'ІПН — 10 цифр' })
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
