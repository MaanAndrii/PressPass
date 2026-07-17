import { IsArray, ArrayMinSize, ArrayMaxSize, IsInt, IsString, MinLength } from 'class-validator';
export class RecoverySlotsDto {
  @IsString() ownerType!: 'user' | 'editorial';
  @IsString() ownerId!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(2) @IsInt({ each: true }) superadminUserIds!: number[];
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MinLength(12, { each: true })
  recoveryPassphrases!: string[];
}
