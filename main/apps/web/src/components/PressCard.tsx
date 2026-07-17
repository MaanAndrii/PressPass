import type { CardLang, CardResponse, CardTemplate } from '@presspass/shared';

import { CardTemplateView, type CardViewData } from './CardTemplateView';

/** Maps an API card into the renderer's data shape (both languages). */
export function toCardViewData(card: CardResponse, nszhuLogoPath?: string | null): CardViewData {
  // Organization is the issuing company's display name; position is stored on
  // the card (both set by the editorial), and the logo comes from the registry.
  const ed = card.editorial;
  return {
    fullName: card.journalist.fullName,
    fullNameEn: card.journalist.fullNameEn,
    position: card.position,
    positionEn: card.positionEn,
    organization: ed ? ed.displayNameUk || ed.name : '',
    organizationEn: ed ? ed.displayNameEn || ed.name : '',
    mediaId: ed?.mediaId || '',
    cardNumber: card.cardNumber,
    expireDate: card.expireDate,
    status: card.status,
    photoPath: card.journalist.photoPath,
    logoOverride: ed?.logoPath ?? null,
    nszhuMember: card.journalist.nszhuMember,
    nszhuLogoPath: nszhuLogoPath ?? null,
  };
}

/**
 * Journalist press credential rendered from the active design template.
 * `qrUrl` is the short-lived tokenized verify URL (refreshed every ~30 s);
 * without it the static URL is shown, which intentionally fails verification.
 */
export function PressCard({
  card,
  template,
  qrUrl,
  lang = 'uk',
  nszhuLogoPath,
}: {
  card: CardResponse;
  template: CardTemplate;
  qrUrl?: string;
  lang?: CardLang;
  /** NSZHU logo path (rendered only for union members). */
  nszhuLogoPath?: string | null;
}) {
  return (
    <CardTemplateView
      template={template}
      qrValue={qrUrl ?? card.verifyUrl}
      lang={lang}
      data={toCardViewData(card, nszhuLogoPath)}
    />
  );
}
