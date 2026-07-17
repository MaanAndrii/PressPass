/**
 * Per-editorial card-number templates. An editorial composes a number pattern
 * from tokens; the sequence resets each year and is scoped to the editorial, so
 * two editorials never share a number (a distinct {prefix} keeps them apart, and
 * the globally-unique card_number column is the final guard).
 */

/** Tokens an admin can put in a number template (shown in the builder UI). */
export const CARD_NUMBER_TOKENS = [
  { token: '{prefix}', label: 'Префікс редакції' },
  { token: '{year}', label: 'Рік (2026)' },
  { token: '{YY}', label: 'Рік, 2 цифри (26)' },
  { token: '{seq}', label: 'Порядковий номер' },
  { token: '{seq:6}', label: 'Порядковий з нулями (000042)' },
  { token: '{mediaId}', label: 'Ідентифікатор медіа' },
] as const;

/** Default number pattern (prefix + year + 6-digit sequence). */
export const DEFAULT_CARD_NUMBER_TEMPLATE = '{prefix}-{year}-{seq:6}';

export interface CardNumberContext {
  prefix: string;
  year: number;
  seq: number;
  mediaId: string;
}

/**
 * Renders a card number from a template and context. `{seq:N}` zero-pads to N
 * digits; unknown tokens are left untouched. Pure and deterministic, so both the
 * API (issuance) and the web (live preview in the editorial form) share it.
 */
export function renderCardNumber(template: string, ctx: CardNumberContext): string {
  return template.replace(/\{(prefix|year|YY|mediaId|seq)(?::(\d+))?\}/g, (match, token, pad) => {
    switch (token) {
      case 'prefix':
        return ctx.prefix;
      case 'year':
        return String(ctx.year);
      case 'YY':
        return String(ctx.year).slice(-2);
      case 'mediaId':
        return ctx.mediaId;
      case 'seq':
        return pad ? String(ctx.seq).padStart(Number(pad), '0') : String(ctx.seq);
      default:
        return match;
    }
  });
}
