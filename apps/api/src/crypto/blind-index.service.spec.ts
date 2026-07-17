import { ConfigService } from '@nestjs/config';
import { BlindIndexService } from './blind-index.service';

describe('BlindIndexService', () => {
  const service = new BlindIndexService(
    new ConfigService({ LOOKUP_KEY: 'lookup-secret-that-is-longer-than-32-bytes' }),
  );
  it('normalizes equivalent email spellings to one opaque index', () => {
    expect(service.email('  USER@Example.COM ')).toBe(service.email('user@example.com'));
    expect(service.email('user@example.com')).toMatch(/^v1:[A-Za-z0-9_-]{43}$/);
    expect(service.email('user@example.com')).not.toContain('user');
  });
  it('uses a separate configured lookup key', () => {
    const other = new BlindIndexService(
      new ConfigService({ LOOKUP_KEY: 'another-lookup-secret-that-is-32-bytes-long' }),
    );
    expect(other.email('user@example.com')).not.toBe(service.email('user@example.com'));
  });
  it('rejects malformed input and weak keys', () => {
    expect(() => service.email('missing-at')).toThrow('Invalid email');
    expect(() =>
      new BlindIndexService(new ConfigService({ LOOKUP_KEY: 'short' })).email('a@b.c'),
    ).toThrow('LOOKUP_KEY');
  });
});
