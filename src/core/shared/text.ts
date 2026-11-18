/** Base64 → text without platform helpers (the logic uses no browser or Node object, so no atob or TextDecoder). */
export function decodeBase64Text(base64: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]!);
    const b = alphabet.indexOf(clean[i + 1] ?? 'A');
    const c = i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]!) : -1;
    const d = i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]!) : -1;
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (c >= 0 && d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  return decodeBytes(bytes);
}

/** Windows-1252 code points for bytes 0x80–0x9F; every other byte is its own code point. */
const CP1252 = [8364, 129, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 141, 381, 143,
  144, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 157, 382, 376];

/** UTF-8 when the bytes are valid UTF-8 (BOM removed), otherwise Windows-1252, as ServiceNow CSV exports can be. */
export function decodeBytes(bytes: ArrayLike<number>): string {
  let out = '';
  let valid = true;
  let i = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length) {
    const first = bytes[i]!;
    const extra = first < 0x80 ? 0 : first >= 0xc2 && first < 0xe0 ? 1 : first >= 0xe0 && first < 0xf0 ? 2 : first >= 0xf0 && first < 0xf5 ? 3 : -1;
    if (extra < 0 || i + extra >= bytes.length + (extra === 0 ? 1 : 0)) { valid = false; break; }
    let code = extra === 0 ? first : first & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k]!;
      if ((next & 0xc0) !== 0x80) { valid = false; break; }
      code = (code << 6) | (next & 0x3f);
    }
    if (!valid) break;
    out += code > 0xffff ? String.fromCharCode(0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff)) : String.fromCharCode(code);
    i += extra + 1;
  }
  if (valid) return out;
  let latin = '';
  for (let k = 0; k < bytes.length; k++) { const byte = bytes[k]!; latin += String.fromCharCode(byte >= 0x80 && byte < 0xa0 ? CP1252[byte - 0x80]! : byte); }
  return latin;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "1 change", "2 changes": a count with the word in the right number. */
export const plural = (count: number, word: string, many = `${word}s`): string => `${count.toLocaleString('en-GB')} ${count === 1 ? word : many}`;

export const ROLE_WORDS: Record<string, string> = { owned_by: 'Owned by', managed_by: 'Managed by', supported_by: 'Supported by', assigned_to: 'Assigned to' };
export const PART_WORDS: Record<string, string> = {
  active: 'active', email: 'email', userId: 'user ID', manager: 'manager', 'manager.email': 'email of the manager', 'manager.userId': 'user ID of the manager',
  'manager.active': 'manager active', departmentHead: 'department head', 'departmentHead.email': 'email of the department head', 'departmentHead.userId': 'user ID of the department head'
};
export const COLUMN_WORDS: Record<string, string> = {
  operationalStatus: 'Operational status', operational_status: 'Operational status', supportGroup: 'Support group', support_group: 'Support group',
  supportGroupActive: 'Support group (active)', parentService: 'Parent', assetTag: 'Asset tag', description: 'Description', name: 'Name',
  exceptionJustification: 'Exception justification', exception_justification: 'Exception justification', exceptionStatus: 'Exception status', exception_status: 'Exception status',
  createdOn: 'Created', updatedOn: 'Updated', className: 'Class', tags: 'Tags'
};

/**
 * The label of a report column as the report layout names it, for a note on the screen: "supported_by.active" is
 * "Supported by (active)", "target.availability" is "Target availability". An unknown name is returned with spaces.
 */
export function columnWord(column: string): string {
  if (COLUMN_WORDS[column]) return COLUMN_WORDS[column]!;
  const dot = column.indexOf('.');
  const head = dot < 0 ? column : column.slice(0, dot);
  const rest = dot < 0 ? '' : column.slice(dot + 1);
  if (ROLE_WORDS[head]) return rest ? `${ROLE_WORDS[head]} (${PART_WORDS[rest] ?? rest.replace(/[._]/g, ' ')})` : ROLE_WORDS[head]!;
  if ((head === 'target' || head === 'inherited') && rest) return `${head === 'target' ? 'Target' : 'Inherited'} ${rest}`;
  const words = column.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "the report has no column "Supported by (active)" (supported_by.active)": the label first, the technical name for whoever builds the report. */
export const missingColumns = (columns: string[], report = 'the report'): string =>
  `${report} has no column ${columns.map((column) => { const word = columnWord(column); return /^[a-z]+(_[a-z]+)*(\.[a-zA-Z]+)*$/.test(column) && word !== column ? `"${word}" (${column})` : `"${word}"`; }).join(', ')}`;
