import { parseCsv } from './csv.ts';
import { normaliseHeader } from './headers.ts';
import { hasHidden } from '../shared/names.ts';
import { decodeBytes } from '../shared/text.ts';
import { isZip, readXlsxSheets } from './xlsx.ts';
import type { Decode, Inflate, Sheet } from './xlsx.ts';

/**
 * Reading a report file into a table, and knowing its type by its columns, never by the file name. The report types
 * themselves are defined next to their readers, one per folder of src/core/sources/, and listed in
 * src/core/sources/report-types.ts.
 */

/** One report type: its name, the columns it must have and its folder in the team folder. The Reports strip shows one tile per type. */
export interface ReportType<K extends string = string> {
  kind: K;
  label: string;
  /** What the report is for, in one line, for the Reports strip. */
  hint: string;
  /** Columns it must have. Each entry lists the header forms that count (after normaliseHeader). */
  needs: Array<{ label: string; any: string[] }>;
  /** The file comes once a week: it counts as old only after this many days (the team setting when that is more). */
  staleAfter?: number;
  /**
   * The subfolder of data/runs/ (and of data/archive/yyyy-mm/) that keeps its loads; '' = data/runs/ itself. Only the
   * CI report uses '', as in version 0.6, so an older version of the app never takes another kind for a CI run.
   */
  folder: string;
}

export interface Recognised<T extends ReportType = ReportType> {
  type: T | null;
  /** When no type fits: what each type is missing, in plain words. */
  message: string;
}

/** The type of a report among `types`, from its header row. The type with the most required columns wins when two fit. */
export function recogniseAmong<T extends ReportType>(headerRow: string[], types: readonly T[]): Recognised<T> {
  const headers = new Set(headerRow.map(normaliseHeader));
  const missing = (type: T): string[] => type.needs.filter((need) => !need.any.some((name) => headers.has(name))).map((need) => need.label);
  const fitting = types.filter((type) => missing(type).length === 0).sort((a, b) => b.needs.length - a.needs.length);
  if (fitting.length) return { type: fitting[0]!, message: '' };
  const parts = types.map((type) => `a ${type.label} needs ${type.needs.map((need) => need.label).join(', ')} (missing: ${missing(type).join(', ')})`);
  return { type: null, message: `This file is not a report the Workbench knows: ${parts.join('; ')}.` };
}

export interface Table {
  rows: string[][];
  format: 'csv' | 'xlsx';
  /** The file keeps hidden characters: an .xlsx, or a CSV with a UTF-8 byte order mark or with hidden characters in it. */
  lossless: boolean;
  /** Every sheet of an .xlsx file with more than one (the first is `rows`). Missing for a CSV and a one-sheet file. */
  sheets?: Sheet[];
}

/** Reads a .csv or .xlsx file into rows. The format comes from the content (an .xlsx is a zip), not from the name. */
export async function readTable(bytes: Uint8Array, inflate: Inflate, decode: Decode = decodeBytes): Promise<Table> {
  if (isZip(bytes)) {
    const sheets = await readXlsxSheets(bytes, inflate, decode);
    return { rows: sheets[0]!.rows, format: 'xlsx', lossless: true, ...(sheets.length > 1 ? { sheets } : {}) };
  }
  const text = decodeBytes(bytes);
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { rows: parseCsv(text), format: 'csv', lossless: bom || hasHidden(text) };
}

/** Report files: .csv and .xlsx, not the lock files Office leaves next to an open file ("~$name.xlsx"). */
export const isReportFile = (name: string): boolean => /\.(csv|xlsx)$/i.test(name) && !/^~\$/.test(name);
