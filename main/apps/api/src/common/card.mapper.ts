import type { Card, Editorial, Journalist } from '@prisma/client';
import { buildVerifyUrl, effectiveCardStatus, type CardResponse } from '@presspass/shared';

import { mapCardEditorial } from './editorial.mapper';
import { mapJournalist } from './journalist.mapper';

/** Formats a Date as YYYY-MM-DD (dates are stored as DATE columns). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Card with the relations the mapper needs. */
export type CardWithRelations = Card & {
  journalist: Journalist;
  editorial?: Editorial | null;
};

/** Maps a Prisma card (+journalist, +editorial) to the public API shape. */
export function mapCard(card: CardWithRelations, verifyBaseUrl: string): CardResponse {
  return {
    id: card.id,
    uuid: card.uuid,
    cardNumber: card.cardNumber,
    issueDate: toIsoDate(card.issueDate),
    expireDate: toIsoDate(card.expireDate),
    status: effectiveCardStatus(card.status, card.expireDate),
    position: card.position,
    positionEn: card.positionEn,
    verifyUrl: buildVerifyUrl(verifyBaseUrl, card.uuid),
    journalist: mapJournalist(card.journalist),
    editorial: mapCardEditorial(card.editorial ?? null),
  };
}
