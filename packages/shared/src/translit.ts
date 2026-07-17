/**
 * Ukrainian → Latin transliteration per the Cabinet of Ministers of Ukraine
 * Resolution No. 55 (27 Jan 2010) — the official rules used for passports.
 *
 * Context rules implemented:
 *  - Є, Ї, Й, Ю, Я at the start of a word → Ye, Yi, Y, Yu, Ya;
 *    elsewhere → ie, i, i, iu, ia.
 *  - Зг → Zgh / зг → zgh (to distinguish from Ж = Zh).
 *  - Ь (soft sign) and ' (apostrophe) are dropped.
 *
 * The result is meant as a suggestion; users may edit it by hand.
 */

const DIRECT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  "'": '',
  '’': '',
};

/** Letters whose romanisation differs at the start of a word. */
const POSITIONAL: Record<string, { initial: string; other: string }> = {
  є: { initial: 'Ye', other: 'ie' },
  ї: { initial: 'Yi', other: 'i' },
  й: { initial: 'Y', other: 'i' },
  ю: { initial: 'Yu', other: 'iu' },
  я: { initial: 'Ya', other: 'ia' },
};

function isWordStart(prev: string | undefined): boolean {
  // A word starts at the beginning or after any non-letter (space, hyphen…).
  return prev === undefined || !/[a-zа-яґєії’']/i.test(prev);
}

/** Matches the case of `sample` onto `value` (all-caps, Titlecase, or lower). */
function matchCase(value: string, sample: string, nextChar: string | undefined): string {
  if (sample === sample.toLowerCase()) {
    return value;
  }
  // Upper-case source: use ALL CAPS only when the following letter is also
  // upper-case (or absent) — e.g. "ЩО" → "SHCHO", but "Що" → "Shcho".
  const nextIsUpper = nextChar !== undefined && nextChar !== nextChar.toLowerCase();
  if (value.length > 1 && !nextIsUpper) {
    return value[0]!.toUpperCase() + value.slice(1);
  }
  return value.toUpperCase();
}

/** Transliterates a Ukrainian string to Latin per KMU Resolution 55. */
export function transliterateUk(input: string): string {
  const chars = [...input];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const lower = ch.toLowerCase();
    const prev = chars[i - 1];
    const next = chars[i + 1];

    // Зг / зг → Zgh / zgh (special digraph).
    if (lower === 'з' && next && next.toLowerCase() === 'г') {
      out += matchCase('zgh', ch, next);
      i += 1; // consume the "г"
      continue;
    }

    const positional = POSITIONAL[lower];
    if (positional) {
      const value = isWordStart(prev) ? positional.initial : positional.other;
      out += ch === lower ? value.toLowerCase() : matchCase(value.toLowerCase(), ch, next);
      continue;
    }

    const direct = DIRECT[lower];
    if (direct !== undefined) {
      out += direct === '' ? '' : matchCase(direct, ch, next);
      continue;
    }

    // Non-Ukrainian characters (spaces, hyphens, latin) pass through.
    out += ch;
  }
  return out;
}
