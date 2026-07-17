/**
 * Card design template: the credential's appearance stored as data, not code,
 * so admins can restyle it without a redeploy.
 *
 * This is a responsive *theme* — colours, branding, layout & typography
 * (card width, font scale, per-field font size/bold, photo size & side, logo
 * size, header alignment) and field labels/visibility/order. In `flow` mode the
 * card screen lays elements out responsively, so long values never overflow.
 * In `absolute` mode (the drag-and-drop designer) the card is a free canvas of
 * positioned `elements` — see CardElement / CARD_LAYOUT_MODES below.
 */

/**
 * Inline data fields (photo column). Card number and expiry are NOT here —
 * they are dedicated positioned elements (see theme). Issue date is not shown.
 */
export const CARD_FIELD_KEYS = ['fullName', 'position', 'organization'] as const;
export type CardFieldKey = (typeof CARD_FIELD_KEYS)[number];

export interface CardThemeField {
  key: CardFieldKey;
  /** Localised caption shown next to the value (only when showFieldLabels). */
  label: string;
  visible: boolean;
  /** Optional per-field value font size in px (12–32); overrides fontScale. */
  fontSize?: number;
  /** Optional bold value. */
  bold?: boolean;
}

export type PhotoPosition = 'left' | 'right';
export type HeaderAlign = 'left' | 'center';
export type FontFamily = 'system' | 'sans' | 'serif' | 'mono' | 'rounded';
export type CardLang = 'uk' | 'en';

/** Horizontal / vertical placement of a body zone's content. */
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';

/** The three stacked zones of the card body. */
export type ZoneName = 'top' | 'middle' | 'bottom';

/**
 * A body zone: free positioning (horizontal + vertical) and its own line
 * height, so each block can be nudged independently within its third.
 */
export interface CardZone {
  hAlign: HAlign;
  vAlign: VAlign;
  /** Line height (leading) for this zone only (1.0–2.2). */
  lineHeight: number;
}

/** CSS font stacks for each selectable family (web-safe, no external fonts). */
export const FONT_FAMILY_STACKS: Record<FontFamily, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", ui-monospace, monospace',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
};

export interface CardTheme {
  /** Header caption, e.g. "PRESS" or "ПОСВІДЧЕННЯ ЖУРНАЛІСТА". */
  titleText: string;
  /** Optional second header line (subtitle). */
  subtitleText: string;
  titleBgColor: string;
  titleColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  /** Logo image path (served from /uploads/branding) or null for none. */
  logoSrc: string | null;
  /** Whether the logo is shown on the card at all. */
  showLogo: boolean;
  // ── Layout & typography (Level 1.5) ──────────────────────────────────────
  /**
   * Intrinsic card size in px. The card keeps this fixed aspect ratio and is
   * scaled uniformly to fit the phone screen, so header/footer/zones always
   * keep their proportions. Width 300–520, height 480–900.
   */
  cardWidth: number;
  cardHeight: number;
  /** Fixed header height in px (48–200). */
  headerHeight: number;
  /** Fixed footer (QR) height in px (140–360). */
  footerHeight: number;
  /** Global text size multiplier (0.8–1.4). */
  fontScale: number;
  /** Base line height for header/footer; body zones override per zone. */
  lineHeight: number;
  /** Font family for card text. */
  fontFamily: FontFamily;
  /** Header title font size in px (16–40). */
  titleFontSize: number;
  /** Photo width in px (64–160); height keeps a 3:4 portrait ratio. */
  photoWidth: number;
  /** Photo on the left or right of the name/position. */
  photoPosition: PhotoPosition;
  /** Logo height in px (24–160). */
  logoHeight: number;
  /** Header content alignment. */
  headerAlign: HeaderAlign;
  /** Footer band (holds the QR caption) background and text colours. */
  footerBgColor: string;
  footerTextColor: string;
  // ── Layout (Level 2) ──────────────────────────────────────────────────────
  /** Show captions above field values (ПІБ/Посада/…). Off by default. */
  showFieldLabels: boolean;
  /** Card number font size in px (9–24). */
  cardNumberFontSize: number;
  /**
   * Body zones: top (photo + name/position), middle (logo + organization),
   * bottom (card number + expiry). Each positions its content independently.
   */
  zones: Record<ZoneName, CardZone>;
  // ── English side (flip) ───────────────────────────────────────────────────
  titleTextEn: string;
  subtitleTextEn: string;
  qrCaptionEn: string;
}

// ── Free-positioned layout (Level 3: drag-and-drop designer) ────────────────

/**
 * Two ways a template can be laid out:
 *  - `flow`     — the responsive three-zone layout (header / body zones / QR
 *                 footer). Long values never overflow; this is the legacy mode
 *                 and stays the default so previously-saved cards are untouched.
 *  - `absolute` — a free canvas: every element has an (x, y) position and size,
 *                 edited in the drag-and-drop designer. `flow` chrome (header
 *                 band, footer) is not drawn; the whole card is the canvas.
 */
export const CARD_LAYOUT_MODES = ['flow', 'absolute'] as const;
export type CardLayoutMode = (typeof CARD_LAYOUT_MODES)[number];

/** Element kinds available in the drag-and-drop designer. */
export const CARD_ELEMENT_TYPES = ['text', 'image', 'qr', 'date'] as const;
export type CardElementType = (typeof CARD_ELEMENT_TYPES)[number];

/**
 * What a text/date element reads from. `custom` renders the literal `content`;
 * every other value binds to live card data so the real credential is shown.
 * `date` elements always read `expireDate` regardless of binding.
 */
export const TEXT_BINDINGS = [
  'title',
  'subtitle',
  'fullName',
  'position',
  'organization',
  'mediaId',
  'cardNumber',
  'expireDate',
  'qrCaption',
  'custom',
] as const;
export type TextBinding = (typeof TEXT_BINDINGS)[number];

/**
 * What an image element shows: the journalist photo, the editorial logo, the
 * NSZHU logo (only for union members), or a custom file.
 */
export const IMAGE_BINDINGS = ['photo', 'logo', 'nszhuLogo', 'custom'] as const;
export type ImageBinding = (typeof IMAGE_BINDINGS)[number];

export type CardElementAlign = 'left' | 'center' | 'right';

/**
 * A single free-positioned element. Position/size are in card pixels (the same
 * coordinate space as `theme.cardWidth`/`cardHeight`). Style props are optional
 * overrides; when absent the renderer uses sensible per-type defaults. Nothing
 * here is HTML — `content`/`src` are plain data, so templates stay XSS-safe.
 */
export interface CardElement {
  id: string;
  type: CardElementType;
  /** Data source; `custom` uses `content`/`src`. See TEXT_/IMAGE_BINDINGS. */
  binding: string;
  /** Literal text for `custom` text elements (or a prefix override). */
  content?: string;
  /** Relative image path for a `custom` image element. */
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // ── Style overrides ──
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean;
  color?: string;
  /** Optional element background (e.g. a coloured header band). */
  bg?: string;
  align?: CardElementAlign;
  /** Opacity 0.2–1. */
  opacity?: number;
  /** Rotation in 90° steps: 0 | 90 | 180 | 270 (clockwise). */
  rotation?: number;
}

export interface CardTemplate {
  theme: CardTheme;
  fields: CardThemeField[];
  /** Footer caption (Ukrainian side). */
  qrCaption: string;
  /** Which layout the card uses (default `flow`). */
  layoutMode: CardLayoutMode;
  /** Snap grid step in px for the designer (2–50). */
  gridSize: number;
  /** Free-positioned elements (used when `layoutMode === 'absolute'`). */
  elements: CardElement[];
}

/** The built-in default design (also the seed/fallback value). */
export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  theme: {
    titleText: 'ПОСВІДЧЕННЯ ЖУРНАЛІСТА',
    subtitleText: 'PressPass Platform',
    titleBgColor: '#1d4ed8',
    titleColor: '#ffffff',
    accentColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
    logoSrc: '/icons/logo.svg',
    showLogo: true,
    cardWidth: 360,
    cardHeight: 640,
    headerHeight: 76,
    footerHeight: 210,
    fontScale: 1,
    lineHeight: 1.4,
    fontFamily: 'system',
    titleFontSize: 18,
    photoWidth: 92,
    photoPosition: 'left',
    logoHeight: 44,
    headerAlign: 'left',
    footerBgColor: '#f8fafc',
    footerTextColor: '#94a3b8',
    showFieldLabels: false,
    cardNumberFontSize: 12,
    zones: {
      top: { hAlign: 'left', vAlign: 'center', lineHeight: 1.3 },
      middle: { hAlign: 'center', vAlign: 'center', lineHeight: 1.3 },
      bottom: { hAlign: 'left', vAlign: 'center', lineHeight: 1.4 },
    },
    titleTextEn: 'PRESS CARD',
    subtitleTextEn: 'PressPass Platform',
    qrCaptionEn: 'Scan the QR code to verify this credential',
  },
  fields: [
    { key: 'fullName', label: 'ПІБ', visible: true },
    { key: 'position', label: 'Посада', visible: true },
    { key: 'organization', label: 'Редакція', visible: true },
  ],
  qrCaption: 'Скануйте QR-код для перевірки дійсності посвідчення',
  layoutMode: 'flow',
  gridSize: 10,
  // Starting point for the free-canvas designer: reproduces the card's usual
  // structure so switching to `absolute` looks familiar, then can be rearranged.
  elements: [
    {
      id: 'title',
      type: 'text',
      binding: 'title',
      x: 0,
      y: 0,
      width: 360,
      height: 52,
      fontSize: 18,
      bold: true,
      color: '#ffffff',
      bg: '#1d4ed8',
      align: 'center',
    },
    {
      id: 'mediaId',
      type: 'text',
      binding: 'mediaId',
      x: 20,
      y: 64,
      width: 320,
      height: 18,
      fontSize: 10,
      color: '#64748b',
      align: 'left',
    },
    { id: 'photo', type: 'image', binding: 'photo', x: 20, y: 92, width: 92, height: 123 },
    {
      id: 'fullName',
      type: 'text',
      binding: 'fullName',
      x: 124,
      y: 100,
      width: 216,
      height: 44,
      fontSize: 15,
      bold: true,
      align: 'left',
    },
    {
      id: 'position',
      type: 'text',
      binding: 'position',
      x: 124,
      y: 150,
      width: 216,
      height: 20,
      fontSize: 13,
      align: 'left',
    },
    { id: 'logo', type: 'image', binding: 'logo', x: 150, y: 236, width: 60, height: 60 },
    {
      id: 'organization',
      type: 'text',
      binding: 'organization',
      x: 20,
      y: 308,
      width: 320,
      height: 22,
      fontSize: 14,
      align: 'center',
    },
    {
      id: 'cardNumber',
      type: 'text',
      binding: 'cardNumber',
      x: 20,
      y: 356,
      width: 200,
      height: 18,
      fontSize: 12,
      color: '#475569',
      align: 'left',
    },
    {
      id: 'expireDate',
      type: 'date',
      binding: 'expireDate',
      x: 20,
      y: 380,
      width: 200,
      height: 18,
      fontSize: 12,
      color: '#475569',
      align: 'left',
    },
    { id: 'qr', type: 'qr', binding: 'qr', x: 130, y: 424, width: 100, height: 100 },
    {
      id: 'qrCaption',
      type: 'text',
      binding: 'qrCaption',
      x: 20,
      y: 534,
      width: 320,
      height: 30,
      fontSize: 11,
      color: '#94a3b8',
      align: 'center',
    },
  ],
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

function text(value: unknown, fallback: string, maxLength = 120): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fallback;
}

/** Clamps a numeric input into [min, max], falling back when not a number. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  // Only genuine numbers or non-empty numeric strings; null/''/bool → fallback
  // (Number(null) is 0, which would otherwise clamp instead of falling back).
  const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const n = isNumeric ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerces one body zone (positioning + line height) into a safe value. */
function zone(value: unknown, fallback: CardZone): CardZone {
  const z = (value ?? {}) as Partial<CardZone>;
  return {
    hAlign: oneOf<HAlign>(z.hAlign, ['left', 'center', 'right'], fallback.hAlign),
    vAlign: oneOf<VAlign>(z.vAlign, ['top', 'center', 'bottom'], fallback.vAlign),
    lineHeight: Math.round(num(z.lineHeight, fallback.lineHeight, 1, 2.2) * 10) / 10,
  };
}

/** Coerces one free-positioned element into a safe value (or null to drop). */
function element(value: unknown, index: number): CardElement | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const e = value as Partial<CardElement>;
  const type = oneOf<CardElementType>(e.type, CARD_ELEMENT_TYPES, 'text');
  const id =
    typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 40 ? e.id : `el-${index}`;
  const out: CardElement = {
    id,
    type,
    binding: typeof e.binding === 'string' && e.binding.length <= 40 ? e.binding : 'custom',
    x: Math.round(num(e.x, 0, 0, 2000)),
    y: Math.round(num(e.y, 0, 0, 2000)),
    width: Math.round(num(e.width, 80, 4, 2000)),
    height: Math.round(num(e.height, 20, 4, 2000)),
  };
  if (e.content !== undefined) {
    out.content = text(e.content, '', 200);
  }
  if (e.src !== undefined) {
    out.src =
      typeof e.src === 'string' && e.src.startsWith('/') && e.src.length <= 300 ? e.src : undefined;
    if (out.src === undefined) {
      delete out.src;
    }
  }
  if (e.fontSize !== undefined) {
    out.fontSize = Math.round(num(e.fontSize, 14, 6, 60));
  }
  if (e.bold !== undefined) {
    out.bold = Boolean(e.bold);
  }
  if (e.italic !== undefined) {
    out.italic = Boolean(e.italic);
  }
  if (e.uppercase !== undefined) {
    out.uppercase = Boolean(e.uppercase);
  }
  if (e.color !== undefined) {
    out.color = color(e.color, '#0f172a');
  }
  if (e.bg !== undefined) {
    out.bg = color(e.bg, '#ffffff');
  }
  if (e.align !== undefined) {
    out.align = oneOf<CardElementAlign>(e.align, ['left', 'center', 'right'], 'left');
  }
  if (e.opacity !== undefined) {
    out.opacity = Math.round(num(e.opacity, 1, 0.2, 1) * 100) / 100;
  }
  if (e.rotation !== undefined) {
    // Snap to the nearest 90° step in [0, 270].
    const r = (((Math.round(num(e.rotation, 0, 0, 270) / 90) * 90) % 360) + 360) % 360;
    out.rotation = r;
  }
  return out;
}

/**
 * Coerces arbitrary (admin-provided) input into a safe CardTemplate.
 * Everything is a plain data value — no HTML/JS is ever accepted, and only
 * whitelisted field keys survive — so a template can be rendered as data
 * without XSS risk. Unknown or malformed properties fall back to the default.
 */
export function sanitizeCardTemplate(input: unknown): CardTemplate {
  const raw = (input ?? {}) as Partial<CardTemplate>;
  const d = DEFAULT_CARD_TEMPLATE;
  const t = (raw.theme ?? {}) as Partial<CardTheme>;

  const logoSrc =
    typeof t.logoSrc === 'string' && t.logoSrc.startsWith('/') && t.logoSrc.length <= 300
      ? t.logoSrc
      : t.logoSrc === null
        ? null
        : d.theme.logoSrc;

  const theme: CardTheme = {
    titleText: text(t.titleText, d.theme.titleText, 60),
    subtitleText: text(t.subtitleText, d.theme.subtitleText, 60),
    titleBgColor: color(t.titleBgColor, d.theme.titleBgColor),
    titleColor: color(t.titleColor, d.theme.titleColor),
    accentColor: color(t.accentColor, d.theme.accentColor),
    backgroundColor: color(t.backgroundColor, d.theme.backgroundColor),
    textColor: color(t.textColor, d.theme.textColor),
    logoSrc,
    showLogo: t.showLogo === undefined ? d.theme.showLogo : Boolean(t.showLogo),
    cardWidth: Math.round(num(t.cardWidth, d.theme.cardWidth, 300, 520)),
    cardHeight: Math.round(num(t.cardHeight, d.theme.cardHeight, 480, 900)),
    headerHeight: Math.round(num(t.headerHeight, d.theme.headerHeight, 48, 200)),
    footerHeight: Math.round(num(t.footerHeight, d.theme.footerHeight, 140, 360)),
    fontScale: Math.round(num(t.fontScale, d.theme.fontScale, 0.8, 1.4) * 100) / 100,
    lineHeight: Math.round(num(t.lineHeight, d.theme.lineHeight, 1, 2.2) * 10) / 10,
    fontFamily: oneOf<FontFamily>(
      t.fontFamily,
      ['system', 'sans', 'serif', 'mono', 'rounded'],
      d.theme.fontFamily,
    ),
    titleFontSize: Math.round(num(t.titleFontSize, d.theme.titleFontSize, 16, 40)),
    photoWidth: Math.round(num(t.photoWidth, d.theme.photoWidth, 64, 160)),
    photoPosition: oneOf<PhotoPosition>(t.photoPosition, ['left', 'right'], d.theme.photoPosition),
    logoHeight: Math.round(num(t.logoHeight, d.theme.logoHeight, 24, 160)),
    headerAlign: oneOf<HeaderAlign>(t.headerAlign, ['left', 'center'], d.theme.headerAlign),
    footerBgColor: color(t.footerBgColor, d.theme.footerBgColor),
    footerTextColor: color(t.footerTextColor, d.theme.footerTextColor),
    showFieldLabels: Boolean(t.showFieldLabels),
    cardNumberFontSize: Math.round(num(t.cardNumberFontSize, d.theme.cardNumberFontSize, 9, 24)),
    zones: {
      top: zone(t.zones?.top, d.theme.zones.top),
      middle: zone(t.zones?.middle, d.theme.zones.middle),
      bottom: zone(t.zones?.bottom, d.theme.zones.bottom),
    },
    titleTextEn: text(t.titleTextEn, d.theme.titleTextEn, 60),
    subtitleTextEn: text(t.subtitleTextEn, d.theme.subtitleTextEn, 60),
    qrCaptionEn: text(t.qrCaptionEn, d.theme.qrCaptionEn, 120),
  };

  // Preserve admin order/labels/visibility, but only for known keys, deduped,
  // then append any keys the admin omitted (so every key appears exactly once).
  const byKey = new Map<CardFieldKey, CardThemeField>();
  const incoming = Array.isArray(raw.fields) ? raw.fields : [];
  for (const field of incoming) {
    const key = (field as CardThemeField)?.key;
    if (CARD_FIELD_KEYS.includes(key) && !byKey.has(key)) {
      const fallback = d.fields.find((f) => f.key === key)!;
      const f = field as CardThemeField;
      byKey.set(key, {
        key,
        label: text(f.label, fallback.label, 40),
        visible: f.visible !== false,
        // Optional per-field overrides — only stored when explicitly provided.
        ...(f.fontSize !== undefined ? { fontSize: Math.round(num(f.fontSize, 14, 12, 32)) } : {}),
        ...(f.bold !== undefined ? { bold: Boolean(f.bold) } : {}),
      });
    }
  }
  for (const field of d.fields) {
    if (!byKey.has(field.key)) {
      byKey.set(field.key, field);
    }
  }
  const fields = [...byKey.values()];

  const elements = Array.isArray(raw.elements)
    ? raw.elements
        .slice(0, 40)
        .map((el, i) => element(el, i))
        .filter((el): el is CardElement => el !== null)
    : d.elements.map((el) => ({ ...el }));

  return {
    theme,
    fields,
    qrCaption: text(raw.qrCaption, d.qrCaption, 120),
    layoutMode: oneOf<CardLayoutMode>(raw.layoutMode, CARD_LAYOUT_MODES, d.layoutMode),
    gridSize: Math.round(num(raw.gridSize, d.gridSize, 2, 50)),
    elements,
  };
}
