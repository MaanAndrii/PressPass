import { UnlockSessionService } from './unlock-session.service';

describe('UnlockSessionService', () => {
  it('returns key copies only to the owning user and revokes prior sessions', () => {
    const service = new UnlockSessionService();
    const original = Buffer.alloc(32, 7);
    const first = service.create(1, new Map([['profile', original]]));
    expect(service.key(first.token, 1, 'profile')).toEqual(original);
    expect(() => service.key(first.token, 2, 'profile')).toThrow();
    service.create(1, new Map([['profile', original]]));
    expect(() => service.key(first.token, 1, 'profile')).toThrow();
    service.onModuleDestroy();
  });
});
