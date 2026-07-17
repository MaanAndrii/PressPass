/**
 * Builds the public verification URL that is embedded in a card's QR code.
 *
 * The QR code must contain ONLY this URL — never any personal data.
 * Format: {baseUrl}/verify/{uuid}[?t={signed short-lived token}]
 * Without the token the verification page reveals no data (anti-forgery).
 */
export function buildVerifyUrl(baseUrl: string, uuid: string, token?: string): string {
  const base = `${baseUrl.replace(/\/+$/, '')}/verify/${uuid}`;
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}
