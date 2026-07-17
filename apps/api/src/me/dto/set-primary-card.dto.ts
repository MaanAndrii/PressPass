import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

/** PUT /card/primary — pick which of the journalist's cards is primary. */
export class SetPrimaryCardDto {
  @ApiProperty({ example: 1, description: 'Id of the card to make primary' })
  @IsInt()
  @IsPositive()
  cardId!: number;
}
