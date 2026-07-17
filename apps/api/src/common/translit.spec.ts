import { transliterateUk } from '@presspass/shared';

describe('transliterateUk (KMU Resolution 55)', () => {
  it('romanises common names', () => {
    expect(transliterateUk('Іван Петренко')).toBe('Ivan Petrenko');
    expect(transliterateUk('Гнатюк Олег')).toBe('Hnatiuk Oleh');
    expect(transliterateUk('Явдоха')).toBe('Yavdokha');
  });

  it('applies word-initial vs. mid-word rules for є/ї/й/ю/я', () => {
    // Initial: Ye/Yi/Y/Yu/Ya; mid-word: ie/i/i/iu/ia.
    expect(transliterateUk('Юлія')).toBe('Yuliia');
    expect(transliterateUk('Їжакевич')).toBe('Yizhakevych');
    expect(transliterateUk('Андрій')).toBe('Andrii');
  });

  it('handles the зг → zgh digraph and drops the soft sign', () => {
    expect(transliterateUk('Згурський')).toBe('Zghurskyi');
    expect(transliterateUk('Щербань')).toBe('Shcherban');
  });

  it('leaves latin text and separators untouched', () => {
    expect(transliterateUk('Ivan-Петро')).toBe('Ivan-Petro');
  });
});
