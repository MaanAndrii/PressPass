import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCardDto {
  @ApiProperty({ example: 1, description: 'Journalist id the card is issued to' })
  @IsInt()
  @Min(1)
  journalistId!: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Issuing company (редакція) id; forced to their own for an editorial admin',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  editorialId?: number;

  @ApiPropertyOptional({ example: 'Кореспондент', description: 'Position set by the editorial' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @ApiPropertyOptional({ example: 'Correspondent', description: 'Position (English)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  positionEn?: string;

  @ApiPropertyOptional({
    example: 'PP-2026-000123',
    description: 'Card number; generated automatically when omitted',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,32}$/, {
    message: 'cardNumber must be 4–32 characters: letters, digits, dashes',
  })
  cardNumber?: string;

  @ApiPropertyOptional({ example: '2026-07-09', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiProperty({ example: '2027-07-09' })
  @IsDateString()
  expireDate!: string;
}
