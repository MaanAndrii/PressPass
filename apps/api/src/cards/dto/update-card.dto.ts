import { ApiPropertyOptional } from '@nestjs/swagger';
import { CARD_STATUSES, type CardStatus } from '@presspass/shared';
import { IsDateString, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateCardDto {
  @ApiPropertyOptional({ example: 'PP-2026-000123' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,32}$/, {
    message: 'cardNumber must be 4–32 characters: letters, digits, dashes',
  })
  cardNumber?: string;

  @ApiPropertyOptional({ example: '2026-07-09' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2027-07-09' })
  @IsOptional()
  @IsDateString()
  expireDate?: string;

  @ApiPropertyOptional({ enum: CARD_STATUSES })
  @IsOptional()
  @IsIn(CARD_STATUSES)
  status?: CardStatus;
}
