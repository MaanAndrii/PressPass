import { BadRequestException } from '@nestjs/common';
import { assertImageBytes } from './secure-image';

describe('assertImageBytes', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
  ])('accepts a valid %s signature', (mimeType, bytes) => {
    expect(() => assertImageBytes(bytes, mimeType)).not.toThrow();
  });

  it('rejects a file whose declared type does not match its bytes', () => {
    expect(() => assertImageBytes(Buffer.from('<svg/>'), 'image/png')).toThrow(BadRequestException);
  });

  it('rejects unsupported SVG even when its markup is valid', () => {
    expect(() => assertImageBytes(Buffer.from('<svg/>'), 'image/svg+xml')).toThrow(
      BadRequestException,
    );
  });
});
