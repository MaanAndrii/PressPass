import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Creates an administrator (system or editorial-bound). */
export class CreateAdminDto {
  @ApiProperty({ example: 'editor@pryklad.media' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ng_Password!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'EDITORIAL_ADMIN'], default: 'EDITORIAL_ADMIN' })
  @IsOptional()
  @IsIn(['ADMIN', 'EDITORIAL_ADMIN'])
  role?: 'ADMIN' | 'EDITORIAL_ADMIN';

  @ApiPropertyOptional({ example: 1, description: 'Required for EDITORIAL_ADMIN' })
  @IsOptional()
  @IsInt()
  @Min(1)
  editorialId?: number;
}
