import type { Editorial as PrismaEditorial } from '@prisma/client';
import type { CardEditorial, Editorial } from '@presspass/shared';

/** Editorial details that live only in the encrypted payload (under the KEK). */
export interface EditorialSecret {
  name: string;
  displayNameUk: string;
  displayNameEn: string;
  mediaId: string;
  edrpou: string;
  website: string;
  logoPath: string | null;
  director: string;
  email: string;
  address: string;
  phone: string;
  cardNumberPrefix: string;
  cardNumberTemplate: string;
}

/** An editorial row hydrated with its decrypted details. */
export type HydratedEditorial = PrismaEditorial & Partial<EditorialSecret>;

const CARD_NUMBER_TEMPLATE_DEFAULT = '{prefix}-{year}-{seq:6}';

/** Maps a hydrated editorial to the full admin API shape. */
export function mapEditorial(editorial: HydratedEditorial): Editorial {
  return {
    id: editorial.id,
    name: editorial.name ?? '',
    displayNameUk: editorial.displayNameUk ?? '',
    displayNameEn: editorial.displayNameEn ?? '',
    mediaId: editorial.mediaId ?? '',
    edrpou: editorial.edrpou ?? '',
    website: editorial.website ?? '',
    logoPath: editorial.logoPath ?? null,
    director: editorial.director ?? '',
    email: editorial.email ?? '',
    address: editorial.address ?? '',
    phone: editorial.phone ?? '',
    cardNumberPrefix: editorial.cardNumberPrefix ?? '',
    cardNumberTemplate: editorial.cardNumberTemplate ?? CARD_NUMBER_TEMPLATE_DEFAULT,
  };
}

/** Compact editorial for cards / the public verify page (no private details). */
export function mapCardEditorial(editorial: HydratedEditorial | null): CardEditorial | null {
  if (!editorial) {
    return null;
  }
  return {
    id: editorial.id,
    name: editorial.name ?? '',
    displayNameUk: editorial.displayNameUk ?? '',
    displayNameEn: editorial.displayNameEn ?? '',
    mediaId: editorial.mediaId ?? '',
    website: editorial.website ?? '',
    logoPath: editorial.logoPath ?? null,
  };
}
