import type { CSSProperties } from 'react';

import {
  FONT_FAMILY_STACKS,
  type CardElement,
  type CardLang,
  type CardTemplate,
} from '@presspass/shared';

import { photoUrl } from '@/lib/config';
import type { CardViewData } from './CardTemplateView';
import { QrCode } from './QrCode';

/** Localised prefix for the labelled bindings (media id, expiry date). */
function labelFor(binding: string, lang: CardLang): string {
  if (binding === 'mediaId') {
    return lang === 'en' ? 'Media ID' : 'Ідентифікатор медіа';
  }
  if (binding === 'expireDate') {
    return lang === 'en' ? 'Valid until' : 'Дійсне до';
  }
  return '';
}

/**
 * Resolves the text an element renders from live card data. `custom` uses the
 * element's literal `content`; `date`/`mediaId` prepend a localised label
 * (overridable via `content`). Returns '' when the bound value is empty.
 */
function resolveText(
  el: CardElement,
  template: CardTemplate,
  data: CardViewData,
  lang: CardLang,
): string {
  const en = lang === 'en';
  const pick = (uk: string, alt?: string) => (en ? alt || uk : uk);
  const binding = el.type === 'date' ? 'expireDate' : el.binding;
  switch (binding) {
    case 'title':
      return en ? template.theme.titleTextEn : template.theme.titleText;
    case 'subtitle':
      return en ? template.theme.subtitleTextEn : template.theme.subtitleText;
    case 'fullName':
      return pick(data.fullName, data.fullNameEn);
    case 'position':
      return pick(data.position, data.positionEn);
    case 'organization':
      return pick(data.organization, data.organizationEn);
    case 'cardNumber':
      return data.cardNumber;
    case 'qrCaption':
      return en ? template.theme.qrCaptionEn : template.qrCaption;
    case 'mediaId': {
      if (!data.mediaId) {
        return '';
      }
      return `${el.content || labelFor('mediaId', lang)} ${data.mediaId}`.trim();
    }
    case 'expireDate':
      return `${el.content || labelFor('expireDate', lang)} ${data.expireDate}`.trim();
    case 'custom':
    default:
      return el.content ?? '';
  }
}

/** Resolves the image src an element shows (photo, logo override, or file). */
function resolveImage(el: CardElement, template: CardTemplate, data: CardViewData): string | null {
  if (el.binding === 'photo') {
    return photoUrl(data.photoPath);
  }
  if (el.binding === 'logo') {
    return photoUrl(data.logoOverride ?? template.theme.logoSrc);
  }
  if (el.binding === 'nszhuLogo') {
    // Union logo appears only for members (and only when one is uploaded).
    return data.nszhuMember ? photoUrl(data.nszhuLogoPath ?? null) : null;
  }
  return photoUrl(el.src ?? null);
}

/**
 * Demo image shown in the design preview when a binding has no real value, so
 * the designer sees a realistic card instead of a dashed box: a portrait stub
 * for the photo, the system logo for the editorial logo, and a generic graphic
 * for custom images.
 */
function demoImage(binding: string): string | null {
  if (binding === 'photo') return '/placeholders/journalist-photo.svg';
  if (binding === 'logo') return '/icons/logo.svg';
  if (binding === 'nszhuLogo') return null; // union logo is member-only
  return '/placeholders/graphic.svg';
}

function textStyle(el: CardElement, theme: CardTemplate['theme']): CSSProperties {
  return {
    fontSize: el.fontSize ? `${Math.round(el.fontSize * theme.fontScale)}px` : undefined,
    fontWeight: el.bold ? 600 : 400,
    fontStyle: el.italic ? 'italic' : 'normal',
    textTransform: el.uppercase ? 'uppercase' : 'none',
    color: el.color,
    textAlign: el.align ?? 'left',
    justifyContent:
      el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
    lineHeight: theme.lineHeight,
  };
}

/**
 * Renders one free-positioned element. In `demo` mode empty bound values show a
 * dashed placeholder so the designer always shows where an element sits.
 */
function ElementView({
  el,
  template,
  data,
  qrValue,
  lang,
  demo,
}: {
  el: CardElement;
  template: CardTemplate;
  data: CardViewData;
  qrValue?: string;
  lang: CardLang;
  demo: boolean;
}) {
  const base: CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity ?? 1,
    overflow: 'hidden',
    // Rotation in 90° steps, around the element's centre.
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };

  if (el.type === 'image') {
    const src = resolveImage(el, template, data) ?? (demo ? demoImage(el.binding) : null);
    if (src) {
      return (
        <img
          src={src}
          alt=""
          style={{ ...base, objectFit: el.binding === 'photo' ? 'cover' : 'contain' }}
        />
      );
    }
    if (!demo) {
      return null;
    }
    return (
      <div
        style={base}
        className="flex items-center justify-center rounded border border-dashed border-black/25 bg-black/[0.03] text-[10px] text-black/40"
      >
        {el.binding === 'photo'
          ? '👤 ФОТО'
          : el.binding === 'logo'
            ? 'ЛОГО'
            : el.binding === 'nszhuLogo'
              ? 'НСЖУ'
              : 'IMG'}
      </div>
    );
  }

  if (el.type === 'qr') {
    const size = Math.min(el.width, el.height);
    return (
      <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <QrCode value={qrValue ?? 'https://id.domain.ua/verify/preview'} size={size} />
      </div>
    );
  }

  // text / date
  const value = resolveText(el, template, data, lang);
  if (!value) {
    if (!demo) {
      return null;
    }
    return (
      <div
        style={{ ...base, ...textStyle(el, template.theme), display: 'flex', alignItems: 'center' }}
        className="rounded border border-dashed border-black/15 text-black/30"
      >
        {labelFor(el.type === 'date' ? 'expireDate' : el.binding, lang) || '—'}
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        ...textStyle(el, template.theme),
        display: 'flex',
        alignItems: 'center',
        background: el.bg,
        paddingLeft: el.bg || el.align === 'left' ? 6 : 0,
        paddingRight: el.bg || el.align === 'right' ? 6 : 0,
      }}
    >
      <span style={{ width: '100%' }}>{value}</span>
    </div>
  );
}

/**
 * Renders a press card from a free-positioned (`absolute`) template. The whole
 * card is a canvas at its intrinsic size (theme.cardWidth × cardHeight); callers
 * scale it uniformly to fit the screen, exactly like the flow renderer.
 */
export function CardCanvasView({
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
  demo?: boolean;
}) {
  const { theme } = template;
  return (
    <article
      className="relative overflow-hidden rounded-2xl shadow-xl"
      style={{
        width: theme.cardWidth,
        height: theme.cardHeight,
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: FONT_FAMILY_STACKS[theme.fontFamily],
      }}
    >
      {template.elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          template={template}
          data={data}
          qrValue={qrValue}
          lang={lang}
          demo={demo}
        />
      ))}
    </article>
  );
}
