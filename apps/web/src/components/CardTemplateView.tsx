import type { CSSProperties } from 'react';

import {
  FONT_FAMILY_STACKS,
  type CardFieldKey,
  type CardLang,
  type CardStatus,
  type CardTemplate,
  type CardZone,
} from '@presspass/shared';

import { photoUrl } from '@/lib/config';
import { CardCanvasView } from './CardCanvasView';
import { QrCode } from './QrCode';
import { StatusBadge } from './StatusBadge';

/** Values the template renders. Both languages are supplied; `lang` picks. */
export interface CardViewData {
  fullName: string;
  fullNameEn?: string;
  position: string;
  positionEn?: string;
  organization: string;
  organizationEn?: string;
  /** State media identifier of the issuing editorial (shown when set). */
  mediaId?: string;
  cardNumber: string;
  expireDate: string;
  status?: CardStatus;
  photoPath: string | null;
  /** Logo to use instead of the template logo (e.g. the issuing company's). */
  logoOverride?: string | null;
  /** Whether the journalist is an НСЖУ member (gates the NSZHU logo element). */
  nszhuMember?: boolean;
  /** NSZHU logo path (shown only for members). */
  nszhuLogoPath?: string | null;
}

function pick(uk: string, en: string | undefined, lang: CardLang): string {
  // English side falls back to the Ukrainian value when no translation.
  return lang === 'en' ? en || uk : uk;
}

const V_JUSTIFY: Record<CardZone['vAlign'], CSSProperties['justifyContent']> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};
const H_ITEMS: Record<CardZone['hAlign'], CSSProperties['alignItems']> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};
const H_TEXT: Record<CardZone['hAlign'], CSSProperties['textAlign']> = {
  left: 'left',
  center: 'center',
  right: 'right',
};

/** Positions a zone's content freely inside its third of the body. */
function zoneStyle(z: CardZone): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    justifyContent: V_JUSTIFY[z.vAlign],
    alignItems: H_ITEMS[z.hAlign],
    textAlign: H_TEXT[z.hAlign],
    lineHeight: z.lineHeight,
  };
}

/**
 * Renders one side of a press card at its intrinsic size (theme.cardWidth ×
 * theme.cardHeight); callers scale it uniformly to fit the screen. The layout
 * is fixed: a fixed-height header, a body split into three freely-positioned
 * zones (photo+name / logo+organization / number+expiry) and a fixed-height
 * footer with the QR. `lang` selects the Ukrainian or English content.
 */
export function CardTemplateView({
  template,
  data,
  qrValue,
  lang = 'uk',
  demo = false,
}: {
  template: CardTemplate;
  data: CardViewData;
  qrValue?: string;
  lang?: CardLang;
  /** In the design preview, show a placeholder where the logo would appear. */
  demo?: boolean;
}) {
  // Free-positioned templates render on a separate canvas component.
  if (template.layoutMode === 'absolute') {
    return (
      <CardCanvasView template={template} data={data} qrValue={qrValue} lang={lang} demo={demo} />
    );
  }

  const { theme } = template;
  const photo = photoUrl(data.photoPath);
  // The issuing company's logo (when set) takes precedence over the template's.
  const logo = photoUrl(data.logoOverride ?? theme.logoSrc);
  const photoHeight = Math.round(theme.photoWidth * (4 / 3));
  const scaled = (px: number) => `${Math.round(px * theme.fontScale)}px`;

  const title = lang === 'en' ? theme.titleTextEn : theme.titleText;
  const subtitle = lang === 'en' ? theme.subtitleTextEn : theme.subtitleText;
  const qrCaption = lang === 'en' ? theme.qrCaptionEn : template.qrCaption;
  const expireLabel = lang === 'en' ? 'Valid until' : 'Дійсне до';

  const field = (key: CardFieldKey) => template.fields.find((f) => f.key === key);

  /** Renders a value line (with optional caption) if the field is visible. */
  const line = (key: CardFieldKey, value: string, defFont: number, defBold: boolean) => {
    const f = field(key);
    if (!f || !f.visible) {
      return null;
    }
    return (
      <div>
        {theme.showFieldLabels && (
          <div className="uppercase opacity-50" style={{ fontSize: scaled(9) }}>
            {f.label}
          </div>
        )}
        <div
          style={{
            fontSize: f.fontSize ? scaled(f.fontSize) : scaled(defFont),
            fontWeight: (f.bold ?? defBold) ? 600 : 400,
          }}
        >
          {value}
        </div>
      </div>
    );
  };

  // Logo shown only when enabled; in the design preview a placeholder marks
  // its position even when no image is set, so admins see where it lands.
  const logoImg = theme.showLogo ? (
    logo ? (
      <img
        src={logo}
        alt="Логотип"
        className="object-contain"
        style={{ height: theme.logoHeight, maxWidth: '80%' }}
      />
    ) : demo ? (
      <div
        className="flex items-center justify-center rounded border border-dashed border-black/25 text-black/30"
        style={{ height: theme.logoHeight, width: theme.logoHeight, fontSize: scaled(10) }}
      >
        ЛОГО
      </div>
    ) : null
  ) : null;

  const qrSize = Math.max(96, Math.min(theme.cardWidth - 96, theme.footerHeight - 60));

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-2xl shadow-xl"
      style={{
        width: theme.cardWidth,
        height: theme.cardHeight,
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: FONT_FAMILY_STACKS[theme.fontFamily],
        lineHeight: theme.lineHeight,
      }}
    >
      {/* ── Header (fixed height) ── */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-5"
        style={{
          height: theme.headerHeight,
          backgroundColor: theme.titleBgColor,
          color: theme.titleColor,
          justifyContent: theme.headerAlign === 'center' ? 'center' : 'space-between',
        }}
      >
        <div style={theme.headerAlign === 'center' ? { textAlign: 'center' } : undefined}>
          <h2 className="font-bold leading-tight" style={{ fontSize: scaled(theme.titleFontSize) }}>
            {title}
          </h2>
          {subtitle && (
            <p className="opacity-80" style={{ fontSize: scaled(11) }}>
              {subtitle}
            </p>
          )}
        </div>
        {theme.headerAlign !== 'center' && data.status && <StatusBadge status={data.status} />}
      </header>

      {/* ── Body: three freely-positioned zones ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top: photo + ПІБ + посада */}
        <div
          className="flex-1 border-b px-5 py-3"
          style={{ ...zoneStyle(theme.zones.top), borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div
            className="flex items-center gap-3"
            style={{ flexDirection: theme.photoPosition === 'right' ? 'row-reverse' : 'row' }}
          >
            {photo ? (
              <img
                src={photo}
                alt={`Фото: ${data.fullName}`}
                className="flex-shrink-0 rounded-lg object-cover ring-1 ring-black/10"
                style={{ width: theme.photoWidth, height: photoHeight }}
              />
            ) : (
              <div
                className="flex flex-shrink-0 items-center justify-center rounded-lg bg-black/10 text-3xl opacity-40"
                style={{ width: theme.photoWidth, height: photoHeight }}
              >
                👤
              </div>
            )}
            <div className="min-w-0">
              {line('fullName', pick(data.fullName, data.fullNameEn, lang), 16, true)}
              {line('position', pick(data.position, data.positionEn, lang), 13, false)}
            </div>
          </div>
        </div>

        {/* Middle: логотип + редакція */}
        <div
          className="flex-1 border-b px-5 py-3"
          style={{ ...zoneStyle(theme.zones.middle), borderColor: 'rgba(0,0,0,0.06)' }}
        >
          {logoImg}
          {line('organization', pick(data.organization, data.organizationEn, lang), 14, false)}
          {data.mediaId && (
            <div className="opacity-60" style={{ fontSize: scaled(10) }}>
              {lang === 'en' ? 'Media ID' : 'Ідентифікатор медіа'} {data.mediaId}
            </div>
          )}
        </div>

        {/* Bottom: номер + дата дії */}
        <div className="flex-1 px-5 py-3" style={zoneStyle(theme.zones.bottom)}>
          <div
            className="font-mono opacity-70"
            style={{ fontSize: scaled(theme.cardNumberFontSize) }}
          >
            {data.cardNumber}
          </div>
          <div>
            <span className="uppercase opacity-50" style={{ fontSize: scaled(10) }}>
              {expireLabel}
            </span>{' '}
            <span className="font-semibold" style={{ fontSize: scaled(14) }}>
              {data.expireDate}
            </span>
          </div>
        </div>
      </div>

      {/* ── Footer (fixed height) ── */}
      <footer
        className="flex flex-shrink-0 flex-col items-center justify-center gap-2 border-t px-5"
        style={{
          height: theme.footerHeight,
          borderColor: 'rgba(0,0,0,0.08)',
          backgroundColor: theme.footerBgColor,
          color: theme.footerTextColor,
        }}
      >
        <QrCode value={qrValue ?? 'https://id.domain.ua/verify/preview'} size={qrSize} />
        <p className="text-center leading-tight" style={{ fontSize: scaled(11) }}>
          {qrCaption}
        </p>
      </footer>
    </article>
  );
}
