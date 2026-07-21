import type { Journalist } from '@prisma/client';
import { isProfileComplete, type JournalistProfile } from '@presspass/shared';

import { toIsoDate } from './card.mapper';

/** Questionnaire fields that live only in the journalist's encrypted payload. */
export interface JournalistSecret {
  fullName: string;
  fullNameEn: string;
  position: string;
  positionEn: string;
  organization: string;
  organizationEn: string;
  photoPath: string | null;
  birthDate: string | Date | null;
  passportData: string | null;
  taxNumber: string | null;
  phone: string | null;
  nszhuMember: boolean;
}

/** A journalist row hydrated with its decrypted questionnaire fields. */
export type HydratedJournalist = Journalist & Partial<JournalistSecret>;

/** Maps a hydrated journalist to the API profile shape (incl. questionnaire). */
export function mapJournalist(journalist: HydratedJournalist): JournalistProfile {
  const birthDate = journalist.birthDate ?? null;
  const fullName = journalist.fullName ?? '';
  const photoPath = journalist.photoPath ?? null;
  const passportData = journalist.passportData ?? null;
  const taxNumber = journalist.taxNumber ?? null;
  const phone = journalist.phone ?? null;
  return {
    id: journalist.id,
    publicId: journalist.publicId,
    fullName,
    fullNameEn: journalist.fullNameEn ?? '',
    position: journalist.position ?? '',
    positionEn: journalist.positionEn ?? '',
    organization: journalist.organization ?? '',
    organizationEn: journalist.organizationEn ?? '',
    photoPath,
    birthDate: birthDate ? toIsoDate(birthDate) : null,
    passportData,
    taxNumber,
    phone,
    nszhuMember: journalist.nszhuMember ?? false,
    selfRegistered: journalist.selfRegistered,
    profileComplete: isProfileComplete({
      fullName,
      photoPath,
      birthDate,
      passportData,
      taxNumber,
      phone,
    }),
  };
}
