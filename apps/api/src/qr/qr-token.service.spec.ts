import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { QrTokenService } from './qr-token.service';

describe('QrTokenService', () => {
  let service: QrTokenService;
  let jwt: JwtService;
  const UUID = '018f0000-0000-7000-8000-000000000001';

  async function build(ttl: string | undefined = '60') {
    const moduleRef = await Test.createTestingModule({
      providers: [
        QrTokenService,
        { provide: JwtService, useValue: new JwtService({ secret: 'test-secret' }) },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(ttl) } },
      ],
    }).compile();
    service = moduleRef.get(QrTokenService);
    jwt = moduleRef.get(JwtService);
  }

  it('signs a token that verifies for the same card uuid', async () => {
    await build();
    const token = await service.sign(UUID);
    expect(await service.check(token, UUID)).toBe('VALID');
  });

  it('rejects a token issued for another card', async () => {
    await build();
    const token = await service.sign('018f0000-0000-7000-8000-00000000beef');
    expect(await service.check(token, UUID)).toBe('INVALID');
  });

  it('reports a missing token', async () => {
    await build();
    expect(await service.check(undefined, UUID)).toBe('MISSING');
  });

  it('reports an expired token', async () => {
    await build();
    const token = await jwt.signAsync({ purpose: 'card-verify', card: UUID }, { expiresIn: '-1s' });
    expect(await service.check(token, UUID)).toBe('EXPIRED');
  });

  it('rejects a token signed for another purpose (e.g. a stolen access token)', async () => {
    await build();
    const token = await jwt.signAsync({ sub: 1, email: 'x@y.z', role: 'ADMIN' });
    expect(await service.check(token, UUID)).toBe('INVALID');
  });

  it('rejects garbage tokens', async () => {
    await build();
    expect(await service.check('not-a-jwt', UUID)).toBe('INVALID');
  });
});
