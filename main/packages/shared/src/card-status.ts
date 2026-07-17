import type { CardStatus } from './types';

/**
 * Computes the effective status of a card at a given moment.
 *
 * The database stores ACTIVE / BLOCKED explicitly; expiration is derived from
 * `expireDate` so that a card becomes invalid the day after it expires without
 * requiring a background job. A BLOCKED card stays BLOCKED even if expired.
 */
export function effectiveCardStatus(
  storedStatus: CardStatus,
  expireDate: Date | string,
  now: Date = new Date(),
): CardStatus {
  if (storedStatus === 'BLOCKED') {
    return 'BLOCKED';
  }
  const expire = typeof expireDate === 'string' ? new Date(expireDate) : expireDate;
  // The card is valid through the whole expiration day (inclusive).
  const endOfExpireDay = new Date(
    Date.UTC(expire.getUTCFullYear(), expire.getUTCMonth(), expire.getUTCDate(), 23, 59, 59, 999),
  );
  return now.getTime() > endOfExpireDay.getTime() ? 'EXPIRED' : storedStatus;
}

/** A card is valid only when its effective status is ACTIVE. */
export function isCardValid(
  storedStatus: CardStatus,
  expireDate: Date | string,
  now: Date = new Date(),
): boolean {
  return effectiveCardStatus(storedStatus, expireDate, now) === 'ACTIVE';
}
