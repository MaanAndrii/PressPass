import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  const rows = new Map<string, any>();
  let seq = 1;
  const prisma: any = {
    refreshToken: {
      create: jest.fn(({ data }: any) => {
        const row = { id: seq++, ...data };
        rows.set(data.tokenHash, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(rows.get(where.tokenHash) ?? null)),
      delete: jest.fn(({ where }: any) => {
        for (const [h, r] of rows) if (r.id === where.id) rows.delete(h);
        return Promise.resolve({});
      }),
      deleteMany: jest.fn(() => Promise.resolve({})),
    },
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const service = new RefreshTokenService(prisma, new ConfigService({ REFRESH_TOKEN_DAYS: '7' }));
  beforeEach(() => {
    rows.clear();
    seq = 1;
    jest.clearAllMocks();
  });

  it('stores only a hash, never the raw token', async () => {
    const issued = await service.issue(5, 0);
    const stored = [...rows.values()][0];
    expect(stored.tokenHash).not.toBe(issued.token);
    expect(stored.tokenHash).toHaveLength(64); // sha256 hex
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rotates a valid token and rejects the consumed one (replay-proof)', async () => {
    const issued = await service.issue(5, 0);
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ tokenVersion: 0 });
    const rotated = await service.rotate(issued.token);
    expect(rotated?.userId).toBe(5);
    // The old token is gone; reusing it fails.
    expect(await service.rotate(issued.token)).toBeNull();
  });

  it('rejects a token whose tokenVersion no longer matches (signed out everywhere)', async () => {
    const issued = await service.issue(5, 0);
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 }); // bumped
    expect(await service.rotate(issued.token)).toBeNull();
  });

  it('rejects an unknown token', async () => {
    expect(await service.rotate('nope')).toBeNull();
    expect(await service.rotate(undefined)).toBeNull();
  });
});
