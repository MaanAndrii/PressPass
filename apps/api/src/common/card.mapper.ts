import type { Card } from '@prisma/client';
import { buildVerifyUrl, effectiveCardStatus, type CardResponse } from '@presspass/shared';

import { mapCardEditorial, type HydratedEditorial } from './editorial.mapper';
import { mapJournalist, type HydratedJournalist } from './journalist.mapper';

/** Formats a Date as YYYY-MM-DD (dates are stored as DATE columns). */
export function toIsoDate(date: Date | string): string {
  return (typeof date === 'string' ? new Date(date) : date).toISOString().slice(0, 10);
}

/** Card fields (number, position, dates) that live only in the encrypted payload. */
export interface CardSecretFields {
  cardNumber: string;
  position: string;
  positionEn: string;
  issueDate: Date | string;
  expireDate: Date | string;
}

/** A card hydrated with its decrypted fields and the relations the mapper needs. */
export type CardWithRelations = Card &
  Partial<CardSecretFields> & {
    journalist: HydratedJournalist;
    editorial?: HydratedEditorial | null;
  };

/** Maps a hydrated card (+journalist, +editorial) to the public API shape. */
export function mapCard(card: CardWithRelations, verifyBaseUrl: string): CardResponse {
  return {
    id: card.id,
    uuid: card.uuid,
    cardNumber: card.cardNumber ?? '',
    issueDate: toIsoDate(card.issueDate!),
    expireDate: toIsoDate(card.expireDate!),
    status: effectiveCardStatus(card.status, card.expireDate!),
    position: card.position ?? '',
    positionEn: card.positionEn ?? '',
    verifyUrl: buildVerifyUrl(verifyBaseUrl, card.uuid),
    journalist: mapJournalist(card.journalist),
    editorial: mapCardEditorial(card.editorial ?? null),
  };
}
