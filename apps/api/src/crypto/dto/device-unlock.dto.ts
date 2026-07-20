import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsString, MaxLength } from 'class-validator';

/** The device-held profile data key (base64), sent to re-open an unlock session. */
export class DeviceUnlockDto {
  @ApiProperty({ description: 'Base64 profile data key held on the device' })
  @IsString()
  @IsBase64()
  @MaxLength(128)
  profileKey!: string;
}
