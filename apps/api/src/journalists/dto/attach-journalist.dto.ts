import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /admin/journalists/attach — add a journalist to a media by public id. */
export class AttachJournalistDto {
  @ApiProperty({ example: 'JR-7K3F9Q', description: 'Публічний ID журналіста' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  publicId!: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Редакція (обовʼязкова для системного адміністратора)',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  editorialId?: number;
}
