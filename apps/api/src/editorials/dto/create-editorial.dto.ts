import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEditorialDto {
  @ApiProperty({ example: 'ТОВ «Приклад Медіа»', description: 'Повна юридична назва' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'Онлайн-медіа «Приклад»',
    description: 'Назва для відображення в посвідченні (укр.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayNameUk?: string;

  @ApiPropertyOptional({
    example: '«Pryklad» Media',
    description: 'Назва для відображення в посвідченні (англ.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayNameEn?: string;

  @ApiPropertyOptional({
    example: 'R40-02551',
    description: 'Ідентифікатор медіа (маска ***-*****)',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{3}-[A-Za-z0-9]{5}$/, {
    message: 'mediaId має формат ***-***** (напр. R40-02551)',
  })
  mediaId?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Код ЄДРПОУ (8–10 цифр)' })
  @IsOptional()
  @Matches(/^\d{8,10}$/, { message: 'edrpou must be 8–10 digits' })
  edrpou?: string;

  @ApiPropertyOptional({ example: 'https://pryklad.media/registry' })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'website must be a valid URL' })
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ example: 'Іваненко Іван Іванович' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  director?: string;

  @ApiPropertyOptional({ example: 'office@pryklad.media' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: 'м. Київ, вул. Хрещатик, 1' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: '+380441234567' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    example: 'KV',
    description: 'Префікс нумерації посвідчень (унікальний серед редакцій)',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{0,12}$/, { message: 'Префікс: лише латиниця, цифри, дефіс (до 12)' })
  cardNumberPrefix?: string;

  @ApiPropertyOptional({
    example: '{prefix}-{year}-{seq:6}',
    description: 'Шаблон номера з токенів {prefix} {year} {YY} {seq} {seq:N} {mediaId}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  cardNumberTemplate?: string;
}
