import type { Editorial as PrismaEditorial } from '@prisma/client';
import type { CardEditorial, Editorial } from '@presspass/shared';

/** Maps a Prisma editorial to the full admin API shape. */
export function mapEditorial(editorial: PrismaEditorial): Editorial {
  return {
    id: editorial.id,
    name: editorial.name,
    displayNameUk: editorial.displayNameUk,
    displayNameEn: editorial.displayNameEn,
    mediaId: editorial.mediaId,
    edrpou: editorial.edrpou,
    website: editorial.website,
    logoPath: editorial.logoPath,
    director: editorial.director,
    email: editorial.email,
    address: editorial.address,
    phone: editorial.phone,
    cardNumberPrefix: editorial.cardNumberPrefix,
    cardNumberTemplate: editorial.cardNumberTemplate,
  };
}

/** Compact editorial for cards / the public verify page (no private details). */
export function mapCardEditorial(editorial: PrismaEditorial | null): CardEditorial | null {
  if (!editorial) {
    return null;
  }
  return {
    id: editorial.id,
    name: editorial.name,
    displayNameUk: editorial.displayNameUk,
    displayNameEn: editorial.displayNameEn,
    mediaId: editorial.mediaId,
    website: editorial.website,
    logoPath: editorial.logoPath,
  };
}
