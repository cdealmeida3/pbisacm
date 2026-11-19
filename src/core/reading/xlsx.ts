import { decodeBytes } from '../shared/text.ts';

/**
 * Reads the first sheet of an .xlsx file without any library. Pure: the one step that needs the platform,
 * inflating ("deflate-raw") the zipped parts, is passed in by the host (the browser uses DecompressionStream,
 * the command line uses node:zlib).
 *
 * Handles what ServiceNow exports contain: inline strings (t="inlineStr"), shared strings, a wrong
 * <dimension ref="A1"/>, empty cells left out (the cell reference gives the column, never the position),
 * numbers, booleans, and dates stored as numbers (found by the cell style). A workbook whose XML names its elements with a
 * namespace prefix (`<x:row>`, `<x:c>`, `<x:si>`, as some tools write the Solusi file) is read the same: the prefix of
 * every element is removed first (D350).
 */

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;
export type Decode = (data: Uint8Array) => string;

export interface ZipEntry { name: string; method: number; size: number; compressedSize: number; dataStart: number }

const u16 = (bytes: Uint8Array, at: number): number => bytes[at]! | (bytes[at + 1]! << 8);
const u32 = (bytes: Uint8Array, at: number): number => (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;

/** True when the bytes start like a zip file (an .xlsx is a zip). */
export const isZip = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

/** The files in a zip, from its central directory. */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(bytes, at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new Error('The file is not a valid .xlsx (no zip directory found).');
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('The file is not a valid .xlsx (broken zip directory).');
    const method = u16(bytes, at + 10);
    const compressedSize = u32(bytes, at + 20);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const local = u32(bytes, at + 42);
    const name = decodeBytes(bytes.subarray(at + 46, at + 46 + nameLength));
    if (u32(bytes, local) !== 0x04034b50) throw new Error(`The file is not a valid .xlsx (${name} cannot be found).`);
    const dataStart = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    entries.push({ name, method, size, compressedSize, dataStart });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function entryBytes(bytes: Uint8Array, entry: ZipEntry, inflate: Inflate): Promise<Uint8Array> {
  const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data);
  throw new Error(`The .xlsx part ${entry.name} uses a compression this tool cannot read (method ${entry.method}).`);
}

/* ------------------------------------------------------------------ XML helpers */

/** The XML with the namespace prefix of every element removed (`<x:row r="1">` → `<row r="1">`); attributes are kept. */
export const withoutPrefixes = (xml: string): string => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1');

/** XML entities and the OOXML "_xHHHH_" escape, as text. */
export function unescapeXml(text: string): string {
  return text
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_all, name: string) => {
      if (name === 'lt') return '<';
      if (name === 'gt') return '>';
      if (name === 'amp') return '&';
      if (name === 'quot') return '"';
      if (name === 'apos') return "'";
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  const pattern = /([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) found[match[1]!] = match[2] ?? match[3] ?? '';
  return found;
}

/** The text of a string item (<si> or <is>): every <t>, rich text runs included, phonetic hints left out. */
function stringItem(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let text = '';
  const pattern = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  for (let match = pattern.exec(clean); match; match = pattern.exec(clean)) text += match[1] ?? '';
  return unescapeXml(text);
}

export function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const pattern = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) strings.push(stringItem(match[1] ?? ''));
  return strings;
}

/** Built-in number formats that show a date or a time. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** For each cell style (the "s" of a cell), whether it shows a date. */
export function parseDateStyles(xml: string): boolean[] {
  const custom = new Map<number, string>();
  const formats = /<numFmt\b([^>]*)\/?>/g;
  for (let match = formats.exec(xml); match; match = formats.exec(xml)) {
    const found = attributes(match[1]!);
    custom.set(Number(found.numFmtId), unescapeXml(found.formatCode ?? ''));
  }
  const isDateCode = (code: string): boolean => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const styles: boolean[] = [];
  if (!block) return styles;
  const xfs = /<xf\b([^>]*?)\/?>/g;
  for (let match = xfs.exec(block[1]!); match; match = xfs.exec(block[1]!)) {
    const id = Number(attributes(match[1]!).numFmtId ?? 0);
    styles.push(DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id)!)));
  }
  return styles;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The last day Excel can show, 31 Dec 9999, as a date number. */
const LAST_SERIAL = 2958465;

/**
 * An Excel date number as "yyyy-mm-dd", or "yyyy-mm-dd hh:mm:ss" when it has a time. A number outside Excel's dates
 * (before 1900 or after 31 Dec 9999) is no date: "" (Power BI cannot read it either, D350).
 */
export function excelDate(serial: number, date1904 = false): string {
  if (serial < 0 || serial >= LAST_SERIAL + 1 - (date1904 ? 1462 : 0)) return '';
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 86400) * 1000);
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return serial % 1 === 0 ? day : `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** "B12" → 1 (column index from 0). -1 when the reference has no letters. */
export function columnIndex(reference: string): number {
  const letters = /^[A-Za-z]+/.exec(reference);
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters[0].toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export interface SheetParts { sheet: string; sharedStrings?: string; styles?: string; date1904?: boolean }

/** The rows of one sheet, as text cells. Rows with no value at all are left out, as in a CSV. */
export function parseSheet(parts: SheetParts): string[][] {
  const shared = parts.sharedStrings ? parseSharedStrings(parts.sharedStrings) : [];
  const dates = parts.styles ? parseDateStyles(parts.styles) : [];
  const rows: string[][] = [];
  const rowPattern = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (let row = rowPattern.exec(parts.sheet); row; row = rowPattern.exec(parts.sheet)) {
    const body = row[2] ?? '';
    const cells: string[] = [];
    let next = 0;
    cellPattern.lastIndex = 0;
    for (let cell = cellPattern.exec(body); cell; cell = cellPattern.exec(body)) {
      const found = attributes(cell[1]!);
      const at = found.r ? columnIndex(found.r) : -1;
      const column = at >= 0 ? at : next;
      next = column + 1;
      const inner = cell[2] ?? '';
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      let value = '';
      switch (found.t) {
        case 's': value = shared[Number(raw)] ?? ''; break;
        case 'inlineStr': value = stringItem(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? ''); break;
        case 'b': value = raw === '1' ? 'true' : raw === '0' ? 'false' : ''; break;
        case 'str': case 'e': value = unescapeXml(raw); break;
        case 'd': value = raw.replace('T', ' ').replace(/(\.\d+)?Z?$/, ''); break;
        default: {
          if (raw === '') break;
          const number = Number(raw);
          if (Number.isFinite(number) && dates[Number(found.s ?? 0)]) value = excelDate(number, parts.date1904);
          else value = Number.isFinite(number) && /^-?\d+\.0+$/.test(raw) ? String(number) : raw;
        }
      }
      while (cells.length < column) cells.push('');
      cells[column] = value;
    }
    if (cells.some((value) => value.trim() !== '')) rows.push(cells);
  }
  return rows;
}

/* ------------------------------------------------------------------ the workbook */

/** Where a relationship points, relative to the folder of the part that names it. */
function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function relationships(xml: string, base: string): Array<{ id: string; type: string; target: string }> {
  const found: Array<{ id: string; type: string; target: string }> = [];
  const pattern = /<Relationship\b([^>]*?)\/?>/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    const values = attributes(match[1]!);
    found.push({ id: values.Id ?? '', type: values.Type ?? '', target: resolvePath(base, values.Target ?? '') });
  }
  return found;
}

/** The rows of the first sheet of an .xlsx file. `decode` turns UTF-8 bytes into text (a faster one can be passed in). */
export async function readXlsx(bytes: Uint8Array, inflate: Inflate, decode: Decode = decodeBytes): Promise<string[][]> {
  const sheets = await readXlsxSheets(bytes, inflate, decode, 1);
  return sheets[0]!.rows;
}

/** One sheet of a workbook: its name (the tab) and its rows. */
export interface Sheet { name: string; rows: string[][] }

/**
 * The sheets of an .xlsx file, in tab order (`limit` sheets at most). The Solusi contract file has two tabs: the active
 * contracts and the contracts terminated in the last 7 days.
 */
export async function readXlsxSheets(bytes: Uint8Array, inflate: Inflate, decode: Decode = decodeBytes, limit = 20): Promise<Sheet[]> {
  const entries = new Map<string, ZipEntry>();
  for (const entry of zipEntries(bytes)) entries.set(entry.name.replace(/\\/g, '/'), entry);
  const read = async (path: string): Promise<string> => {
    const entry = entries.get(path);
    return entry ? withoutPrefixes(decode(await entryBytes(bytes, entry, inflate))) : '';
  };
  const root = relationships(await read('_rels/.rels'), '');
  const workbookPath = root.find((item) => /\/officeDocument$/.test(item.type))?.target || 'xl/workbook.xml';
  const workbook = await read(workbookPath);
  if (!workbook) throw new Error('The file is not a valid .xlsx (no workbook inside).');
  const folder = workbookPath.split('/').slice(0, -1).join('/');
  const links = relationships(await read(`${folder}/_rels/${workbookPath.split('/').pop()}.rels`), workbookPath);
  const sharedPath = links.find((item) => /\/sharedStrings$/.test(item.type))?.target || `${folder}/sharedStrings.xml`;
  const stylesPath = links.find((item) => /\/styles$/.test(item.type))?.target || `${folder}/styles.xml`;
  const date1904 = /<workbookPr\b[^>]*date1904\s*=\s*["'](1|true)["']/.test(workbook);
  const listed: Array<{ name: string; path: string }> = [];
  const pattern = /<sheet\b([^>]*?)\/?>/g;
  for (let match = pattern.exec(workbook); match && listed.length < limit; match = pattern.exec(workbook)) {
    const values = attributes(match[1]!);
    const path = links.find((item) => item.id === (values['r:id'] ?? ''))?.target ?? '';
    listed.push({ name: unescapeXml(values.name ?? ''), path: path || (listed.length ? '' : `${folder}/worksheets/sheet1.xml`) });
  }
  if (!listed.length) listed.push({ name: '', path: `${folder}/worksheets/sheet1.xml` });
  const sharedStrings = await read(sharedPath);
  const styles = await read(stylesPath);
  const sheets: Sheet[] = [];
  for (const item of listed) {
    const sheet = item.path ? await read(item.path) : '';
    if (!sheet) { if (!sheets.length && item === listed[0]) throw new Error('The .xlsx file has no sheet to read.'); continue; }
    sheets.push({ name: item.name, rows: parseSheet({ sheet, sharedStrings, styles, date1904 }) });
  }
  if (!sheets.length) throw new Error('The .xlsx file has no sheet to read.');
  return sheets;
}
