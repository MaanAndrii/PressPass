import { randomInt } from 'crypto';

// Unambiguous alphabet: no 0/O/1/I/L so the code is easy to read out or type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A short, human-friendly journalist code, e.g. "JR-7K3F9Q". */
export function generateJournalistPublicId(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `JR-${code}`;
}

/** Normalises a user-entered public id (trim, upper, ensure the JR- prefix). */
export function normalizePublicId(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  return cleaned.startsWith('JR-') ? cleaned : `JR-${cleaned.replace(/^JR/, '')}`;
}
