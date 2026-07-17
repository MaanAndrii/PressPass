import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePositionDto {
  @ApiProperty({ example: 'Кореспондент' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameUk!: string;

  @ApiPropertyOptional({ example: 'Correspondent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;
}
