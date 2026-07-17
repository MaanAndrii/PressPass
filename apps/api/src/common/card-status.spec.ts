import { buildVerifyUrl, effectiveCardStatus, isCardValid } from '@presspass/shared';

describe('buildVerifyUrl', () => {
  it('builds the QR URL as {base}/verify/{uuid}', () => {
    expect(buildVerifyUrl('https://id.domain.ua', 'abc-123')).toBe(
      'https://id.domain.ua/verify/abc-123',
    );
  });

  it('strips trailing slashes from the base URL', () => {
    expect(buildVerifyUrl('https://id.domain.ua/', 'abc')).toBe('https://id.domain.ua/verify/abc');
  });
});

describe('effectiveCardStatus', () => {
  const now = new Date('2026-07-09T12:00:00Z');

  it('keeps ACTIVE while not expired (inclusive of the expiration day)', () => {
    expect(effectiveCardStatus('ACTIVE', new Date('2026-07-09'), now)).toBe('ACTIVE');
    expect(effectiveCardStatus('ACTIVE', new Date('2027-01-01'), now)).toBe('ACTIVE');
  });

  it('derives EXPIRED after the expiration day', () => {
    expect(effectiveCardStatus('ACTIVE', new Date('2026-07-08'), now)).toBe('EXPIRED');
  });

  it('keeps BLOCKED regardless of dates', () => {
    expect(effectiveCardStatus('BLOCKED', new Date('2027-01-01'), now)).toBe('BLOCKED');
    expect(effectiveCardStatus('BLOCKED', new Date('2020-01-01'), now)).toBe('BLOCKED');
  });
});

describe('isCardValid', () => {
  const now = new Date('2026-07-09T12:00:00Z');

  it('is true only for effectively ACTIVE cards', () => {
    expect(isCardValid('ACTIVE', new Date('2027-01-01'), now)).toBe(true);
    expect(isCardValid('ACTIVE', new Date('2026-01-01'), now)).toBe(false);
    expect(isCardValid('BLOCKED', new Date('2027-01-01'), now)).toBe(false);
    expect(isCardValid('EXPIRED', new Date('2027-01-01'), now)).toBe(false);
  });
});
