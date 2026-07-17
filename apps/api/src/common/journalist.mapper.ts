import type { Journalist } from '@prisma/client';
import { isProfileComplete, type JournalistProfile } from '@presspass/shared';

import { toIsoDate } from './card.mapper';

/** Maps a Prisma journalist to the API profile shape (incl. questionnaire). */
export function mapJournalist(journalist: Journalist): JournalistProfile {
  return {
    id: journalist.id,
    publicId: journalist.publicId,
    fullName: journalist.fullName,
    fullNameEn: journalist.fullNameEn,
    position: journalist.position,
    positionEn: journalist.positionEn,
    organization: journalist.organization,
    organizationEn: journalist.organizationEn,
    photoPath: journalist.photoPath,
    birthDate: journalist.birthDate ? toIsoDate(journalist.birthDate) : null,
    passportData: journalist.passportData,
    taxNumber: journalist.taxNumber,
    phone: journalist.phone,
    nszhuMember: journalist.nszhuMember,
    selfRegistered: journalist.selfRegistered,
    profileComplete: isProfileComplete(journalist),
  };
}
