import { renderCardNumber } from '@presspass/shared';

describe('renderCardNumber', () => {
  const ctx = { prefix: 'KV', year: 2026, seq: 42, mediaId: 'R40-02551' };

  it('renders all tokens with zero-padding for {seq:N}', () => {
    expect(renderCardNumber('{prefix}-{year}-{seq:6}', ctx)).toBe('KV-2026-000042');
    expect(renderCardNumber('{prefix}{YY}{seq:4}', ctx)).toBe('KV260042');
    expect(renderCardNumber('{prefix}-{seq}', ctx)).toBe('KV-42');
    expect(renderCardNumber('{mediaId}/{year}', ctx)).toBe('R40-02551/2026');
  });

  it('leaves unknown tokens untouched', () => {
    expect(renderCardNumber('{prefix}-{unknown}-{seq}', ctx)).toBe('KV-{unknown}-42');
  });
});
