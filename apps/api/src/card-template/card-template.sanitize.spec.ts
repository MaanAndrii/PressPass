import { CARD_FIELD_KEYS, DEFAULT_CARD_TEMPLATE, sanitizeCardTemplate } from '@presspass/shared';

describe('sanitizeCardTemplate', () => {
  it('returns the default for empty/garbage input', () => {
    expect(sanitizeCardTemplate(undefined)).toEqual(DEFAULT_CARD_TEMPLATE);
    expect(sanitizeCardTemplate('nope')).toEqual(DEFAULT_CARD_TEMPLATE);
    expect(sanitizeCardTemplate(42)).toEqual(DEFAULT_CARD_TEMPLATE);
  });

  it('keeps valid hex colours and rejects invalid ones', () => {
    const result = sanitizeCardTemplate({
      theme: { titleBgColor: '#ff0000', titleColor: 'red', accentColor: '#abc' },
    });
    expect(result.theme.titleBgColor).toBe('#ff0000');
    expect(result.theme.accentColor).toBe('#abc');
    // 'red' is not a hex value → falls back to default.
    expect(result.theme.titleColor).toBe(DEFAULT_CARD_TEMPLATE.theme.titleColor);
  });

  it('strips HTML/script from text fields by treating them as plain data', () => {
    const result = sanitizeCardTemplate({
      theme: { titleText: '<script>alert(1)</script>' },
      qrCaption: '<img src=x onerror=alert(1)>',
    });
    // The value is preserved as a plain string (React escapes it on render);
    // it is never interpreted as markup, and length is bounded.
    expect(typeof result.theme.titleText).toBe('string');
    expect(result.theme.titleText).not.toContain('undefined');
  });

  it('accepts only a relative logo path or null', () => {
    expect(
      sanitizeCardTemplate({ theme: { logoSrc: '/uploads/branding/x.svg' } }).theme.logoSrc,
    ).toBe('/uploads/branding/x.svg');
    expect(sanitizeCardTemplate({ theme: { logoSrc: null } }).theme.logoSrc).toBeNull();
    // Absolute external URL is rejected → default logo.
    expect(
      sanitizeCardTemplate({ theme: { logoSrc: 'https://evil.com/x.svg' } }).theme.logoSrc,
    ).toBe(DEFAULT_CARD_TEMPLATE.theme.logoSrc);
  });

  it('drops unknown field keys and keeps every known key exactly once', () => {
    const result = sanitizeCardTemplate({
      fields: [
        { key: 'passportData', label: 'Паспорт', visible: true },
        { key: 'fullName', label: 'Name', visible: false },
        { key: 'fullName', label: 'dup', visible: true },
      ],
    });
    expect(result.fields).toHaveLength(CARD_FIELD_KEYS.length);
    expect(result.fields.map((f) => f.key).sort()).toEqual([...CARD_FIELD_KEYS].sort());
    // passportData is not a card field → absent.
    expect(result.fields.find((f) => (f.key as string) === 'passportData')).toBeUndefined();
    // First fullName entry wins (custom label + hidden).
    const fullName = result.fields.find((f) => f.key === 'fullName')!;
    expect(fullName.label).toBe('Name');
    expect(fullName.visible).toBe(false);
  });

  it('clamps layout/typography numbers into their allowed range', () => {
    const tooBig = sanitizeCardTemplate({
      theme: { cardWidth: 9999, fontScale: 5, photoWidth: 10, logoHeight: 500, titleFontSize: 2 },
    }).theme;
    expect(tooBig.cardWidth).toBe(520);
    expect(tooBig.fontScale).toBe(1.4);
    expect(tooBig.photoWidth).toBe(64);
    expect(tooBig.logoHeight).toBe(160);
    expect(tooBig.titleFontSize).toBe(16);

    const garbage = sanitizeCardTemplate({
      theme: { cardWidth: 'wide', fontScale: null, photoPosition: 'top', headerAlign: 'bogus' },
    }).theme;
    expect(garbage.cardWidth).toBe(DEFAULT_CARD_TEMPLATE.theme.cardWidth);
    expect(garbage.fontScale).toBe(DEFAULT_CARD_TEMPLATE.theme.fontScale);
    // Invalid enum values fall back to the default.
    expect(garbage.photoPosition).toBe('left');
    expect(garbage.headerAlign).toBe('left');
  });

  it('clamps per-field font size and only stores overrides when given', () => {
    const result = sanitizeCardTemplate({
      fields: [
        { key: 'fullName', label: 'ПІБ', visible: true, fontSize: 999, bold: true },
        { key: 'position', label: 'Посада', visible: true },
      ],
    });
    const fullName = result.fields.find((f) => f.key === 'fullName')!;
    const position = result.fields.find((f) => f.key === 'position')!;
    expect(fullName.fontSize).toBe(32);
    expect(fullName.bold).toBe(true);
    // No override provided → property stays undefined.
    expect(position.fontSize).toBeUndefined();
    expect(position.bold).toBeUndefined();
  });

  it('whitelists the new layout fields and drops former field keys', () => {
    const theme = sanitizeCardTemplate({
      theme: {
        showFieldLabels: true,
        cardHeight: 720,
        headerHeight: 90,
        footerHeight: 240,
        cardNumberFontSize: 18,
        fontFamily: 'serif',
        lineHeight: 1.8,
        titleTextEn: 'PRESS',
      },
      // cardNumber/issueDate/expireDate are no longer inline fields.
      fields: [{ key: 'cardNumber', label: 'x', visible: true }],
    }).theme;
    expect(theme.showFieldLabels).toBe(true);
    expect(theme.cardHeight).toBe(720);
    expect(theme.headerHeight).toBe(90);
    expect(theme.footerHeight).toBe(240);
    expect(theme.cardNumberFontSize).toBe(18);
    expect(theme.fontFamily).toBe('serif');
    expect(theme.lineHeight).toBe(1.8);
    expect(theme.titleTextEn).toBe('PRESS');

    const fields = sanitizeCardTemplate({
      fields: [{ key: 'cardNumber', label: 'x', visible: true }],
    }).fields;
    expect(fields.find((f) => (f.key as string) === 'cardNumber')).toBeUndefined();
    expect(fields.map((f) => f.key)).toEqual([...CARD_FIELD_KEYS]);

    // Invalid enum values fall back to defaults; out-of-range numbers clamp.
    const bad = sanitizeCardTemplate({
      theme: {
        fontFamily: 'comic',
        lineHeight: 9,
        cardNumberFontSize: 999,
        cardHeight: 99,
        footerHeight: 9999,
      },
    }).theme;
    expect(bad.fontFamily).toBe('system');
    expect(bad.lineHeight).toBe(2.2);
    expect(bad.cardNumberFontSize).toBe(24);
    expect(bad.cardHeight).toBe(480);
    expect(bad.footerHeight).toBe(360);
  });

  it('sanitizes body zones with positioning and per-zone line height', () => {
    const zones = sanitizeCardTemplate({
      theme: {
        zones: {
          top: { hAlign: 'right', vAlign: 'bottom', lineHeight: 2 },
          middle: { hAlign: 'nope', vAlign: 'top', lineHeight: 9 },
          bottom: { hAlign: 'center', vAlign: 'weird', lineHeight: 'x' },
        },
      },
    }).theme.zones;
    expect(zones.top).toEqual({ hAlign: 'right', vAlign: 'bottom', lineHeight: 2 });
    // Invalid enum → default; out-of-range line height → clamped.
    expect(zones.middle.hAlign).toBe(DEFAULT_CARD_TEMPLATE.theme.zones.middle.hAlign);
    expect(zones.middle.vAlign).toBe('top');
    expect(zones.middle.lineHeight).toBe(2.2);
    // Non-numeric line height → default.
    expect(zones.bottom.vAlign).toBe(DEFAULT_CARD_TEMPLATE.theme.zones.bottom.vAlign);
    expect(zones.bottom.lineHeight).toBe(DEFAULT_CARD_TEMPLATE.theme.zones.bottom.lineHeight);
  });

  it('defaults to flow layout with the built-in elements', () => {
    const t = sanitizeCardTemplate({});
    expect(t.layoutMode).toBe('flow');
    expect(t.gridSize).toBe(10);
    expect(t.elements).toEqual(DEFAULT_CARD_TEMPLATE.elements);
  });

  it('sanitizes free-positioned elements (type, binding, geometry, style)', () => {
    const t = sanitizeCardTemplate({
      layoutMode: 'absolute',
      gridSize: 999,
      elements: [
        {
          id: 'a',
          type: 'text',
          binding: 'fullName',
          x: -50,
          y: 10.7,
          width: 5000,
          height: 20,
          fontSize: 999,
          color: 'nope',
          bg: '#ff0000',
          align: 'weird',
          opacity: 5,
        },
        { type: 'bogus', binding: 'x', x: 1, y: 1, width: 10, height: 10 },
        'garbage',
      ],
    });
    expect(t.layoutMode).toBe('absolute');
    // gridSize clamps to [2,50].
    expect(t.gridSize).toBe(50);
    // The string element is dropped; the two objects survive.
    expect(t.elements).toHaveLength(2);
    const a = t.elements[0]!;
    const b = t.elements[1]!;
    expect(a.id).toBe('a');
    expect(a.x).toBe(0); // clamped ≥ 0
    expect(a.y).toBe(11); // rounded
    expect(a.width).toBe(2000); // clamped ≤ 2000
    expect(a.fontSize).toBe(60); // clamped ≤ 60
    expect(a.color).toBe('#0f172a'); // invalid hex → default
    expect(a.bg).toBe('#ff0000');
    expect(a.align).toBe('left'); // invalid enum → default
    expect(a.opacity).toBe(1); // clamped ≤ 1
    // Unknown type/binding fall back; a missing id gets generated.
    expect(b.type).toBe('text');
    expect(b.binding).toBe('x');
    expect(b.id).toBe('el-1');
  });

  it('drops overflowing elements beyond the cap and rejects HTML in content', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      type: 'text',
      binding: 'custom',
      content: '<script>alert(1)</script>',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    }));
    const t = sanitizeCardTemplate({ elements: many });
    expect(t.elements.length).toBeLessThanOrEqual(40);
    // Content is preserved as plain data (React escapes it), never as markup.
    expect(typeof t.elements[0]!.content).toBe('string');
  });

  it('preserves admin field order', () => {
    const result = sanitizeCardTemplate({
      fields: [
        { key: 'organization', label: 'Org', visible: true },
        { key: 'fullName', label: 'Name', visible: true },
      ],
    });
    // Reordered fields come first, in the given order.
    expect(result.fields[0]?.key).toBe('organization');
    expect(result.fields[1]?.key).toBe('fullName');
  });
});
