import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Анкета користувача після реєстрації — усі поля обовʼязкові. */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Петренко Іван Васильович', description: 'ПІП' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Ivan Petrenko', description: 'ПІП латиницею (для картки)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullNameEn?: string;

  @ApiProperty({ example: '1990-05-15', description: 'Дата народження' })
  @IsDateString()
  birthDate!: string;

  @ApiProperty({ example: 'КВ 123456, виданий Шевченківським РВ 01.01.2010' })
  @IsString()
  @MinLength(6)
  @MaxLength(300)
  passportData!: string;

  @ApiProperty({ example: '1234567890', description: 'ІПН — 10 цифр' })
  @Matches(/^\d{10}$/, { message: 'ІПН має складатися з 10 цифр' })
  taxNumber!: string;

  @ApiProperty({ example: '+380501234567' })
  @Matches(/^\+?[\d\s()-]{10,20}$/, { message: 'Невірний формат номера телефону' })
  phone!: string;
}
