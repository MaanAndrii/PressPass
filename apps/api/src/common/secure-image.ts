import { BadRequestException } from '@nestjs/common';
export function assertImageBytes(bytes: Buffer, mimeType: string): void {
  const valid =
    mimeType === 'image/jpeg'
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === 'image/webp'
          ? bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
            bytes.subarray(8, 12).toString('ascii') === 'WEBP'
          : false;
  if (!valid)
    throw new BadRequestException(
      'Image contents do not match the declared JPEG, PNG or WebP type',
    );
}
