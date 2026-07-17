import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, Min } from 'class-validator';

export class BlockCardDto {
  @ApiProperty({ example: 1, description: 'Card id to block (revoke)' })
  @IsInt()
  @Min(1)
  cardId!: number;
}

export class RenewCardDto {
  @ApiProperty({ example: 1, description: 'Card id to renew' })
  @IsInt()
  @Min(1)
  cardId!: number;

  @ApiProperty({ example: '2028-07-09', description: 'New expiration date' })
  @IsDateString()
  expireDate!: string;
}
