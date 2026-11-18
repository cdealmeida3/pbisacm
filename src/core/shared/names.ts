/**
 * Names and the characters nobody can see.
 *
 * Some names in the CMDB hold a zero-width character (most often a zero-width space, U+200B). ServiceNow does not show it,
 * an .xlsx export keeps it, and a Windows-1252 CSV export turns it into "?". For matching, such characters are removed
 * and a non-breaking space counts as a space. The name that is shown is never changed.
 */

/** Zero-width space, zero-width non-joiner, zero-width joiner, byte order mark (zero-width no-break space). */
export const HIDDEN_CHARACTERS: Record<string, string> = {
  '​': 'zero-width space',
  '‌': 'zero-width non-joiner',
  '‍': 'zero-width joiner',
  '﻿': 'zero-width no-break space'
};
const HIDDEN = /[​‌‍﻿]/g;

/** Names are compared in lower case, hidden characters removed, runs of spaces (non-breaking ones too) squashed. */
export const nameKey = (name: string): string => name.replace(HIDDEN, '').replace(/ /g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The name as identity of a CI. A hidden character counts as "?", as the CSV export shows it, so the same CI keeps the same
 * key whether its report came as .csv or .xlsx, and its case history follows it.
 */
export const identityKey = (name: string): string => nameKey(name.replace(HIDDEN, '?'));

/** The name with "?" where a hidden character is, as the CSV export shows it: so a person can see where it sits. */
export const visibleName = (name: string): string => name.replace(HIDDEN, '?');

/** The name without its hidden characters: the name to type in ServiceNow (D243). */
export const withoutHidden = (name: string): string => name.replace(HIDDEN, '');

/** The hidden characters in a name, as readable labels ("zero-width space (U+200B)"), each once. */
export function hiddenCharacters(name: string): string[] {
  const found: string[] = [];
  for (const char of name.match(HIDDEN) ?? []) {
    const label = `${HIDDEN_CHARACTERS[char]} (U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`;
    if (found.indexOf(label) < 0) found.push(label);
  }
  return found;
}

export const hasHidden = (text: string): boolean => /[​‌‍﻿]/.test(text);
