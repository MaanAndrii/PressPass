import { UnauthorizedException } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const handler = () => undefined;
  const controller = class TestController {};
  const request = { headers: { authorization: 'Bearer signed-token' } };
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({
      sub: 7,
      email: 'user@example.com',
      role: 'JOURNALIST',
      tokenVersion: 2,
    }),
  };
  const prisma = { user: { findUnique: jest.fn() } };
  const guard = new JwtAuthGuard(jwt as never, reflector as never, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts a token whose version matches the current account version', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 2 });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('rejects a token revoked by logout or a password change', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects pre-versioning tokens for a legacy account', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: 7,
      email: 'user@example.com',
      role: 'JOURNALIST',
    });
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
