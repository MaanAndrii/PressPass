import { QrProjectionCacheService } from './qr-projection-cache.service';

describe('QrProjectionCacheService', () => {
  const UUID = '018f0000-0000-7000-8000-000000000001';
  const projection = { cardNumber: 'PP-1', expireDate: '2099-01-01', fullName: 'Name' } as never;
  let cache: QrProjectionCacheService;

  beforeEach(() => {
    cache = new QrProjectionCacheService();
  });
  afterEach(() => cache.onModuleDestroy());

  it('resolves a stored projection by its id and card uuid', () => {
    const id = cache.put(UUID, projection, 60);
    expect(cache.get(id, UUID)).toBe(projection);
  });

  it('does not resolve for a different card uuid', () => {
    const id = cache.put(UUID, projection, 60);
    expect(cache.get(id, '018f0000-0000-7000-8000-00000000beef')).toBeNull();
  });

  it('returns null for an unknown id or a missing token', () => {
    expect(cache.get('nope', UUID)).toBeNull();
    expect(cache.get(undefined, UUID)).toBeNull();
  });

  it('stops resolving once the entry has expired', () => {
    jest.useFakeTimers();
    try {
      const id = cache.put(UUID, projection, 1);
      jest.advanceTimersByTime(1500);
      expect(cache.get(id, UUID)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
