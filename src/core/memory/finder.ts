import { isReportFile } from '../reading/table.ts';

/**
 * Finds the newest report among the .csv and .xlsx files of the workspace folder. Pure: the caller lists the files.
 * The filing flow puts the date at the start of each file name (`2026-11-12_cmdb_ci.csv`). A file without that
 * date (put there by hand) is dated by the time it last changed.
 */

export interface ReportFile {
  /** Path inside the workspace, e.g. `reports/2026-11-12_cmdb_ci.csv` or `cmdb_ci.csv`. */
  path: string;
  name: string;
  /** Last change, in milliseconds. */
  modified: number;
}

export interface DatedReport extends ReportFile {
  /** The report date, yyyy-mm-dd. */
  date: string;
  /** Where the date comes from. */
  dateFrom: 'name' | 'modified';
}

/** The date at the start of a file name (`yyyy-MM-dd_`), or ''. */
export function dateInName(name: string): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})_/.exec(name);
  if (!found) return '';
  const month = Number(found[2]); const day = Number(found[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${found[1]}-${found[2]}-${found[3]}` : '';
}

/** A time in milliseconds as a local date, yyyy-mm-dd. `offsetMinutes` is `Date.getTimezoneOffset()` (minutes behind UTC). */
export function localDate(ms: number, offsetMinutes: number): string {
  return new Date(ms - offsetMinutes * 60000).toISOString().slice(0, 10);
}

/** The report files (.csv, .xlsx), newest first: by date (from the name, else from the last change), then by last change, then by name. */
export function reportCandidates(files: ReportFile[], offsetMinutes: number): DatedReport[] {
  return files
    .filter((file) => isReportFile(file.name))
    .map((file): DatedReport => {
      const named = dateInName(file.name);
      return { ...file, date: named || localDate(file.modified, offsetMinutes), dateFrom: named ? 'name' : 'modified' };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.modified - a.modified || a.path.localeCompare(b.path));
}

/** The file name of a saved run: one per report date and report name, so the same report is never saved twice. */
export const safeName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
export const runFileName = (date: string, report: string): string => `${date}_${safeName(report)}.json`;

/* ------------------------------------------------------------------ one report per type and day (D348) */

/** A report file of a known type, for the choice of its day: what makes one file fuller than another of the same day. */
export interface ChoiceFile {
  name: string;
  kind: string;
  /** The report date, yyyy-mm-dd. */
  date: string;
  /** The columns that count for its type (neededColumns of src/core/sources/report-types.ts). */
  columns: number;
  /** Its rows under the header. */
  rows: number;
  /** Last change, in milliseconds; 0 when it is not known. */
  modified: number;
}

export interface Choice { name: string; used: boolean; whyNotUsed: string }


const fuller = (a: ChoiceFile, b: ChoiceFile): number =>
  b.columns - a.columns || b.rows - a.rows || b.modified - a.modified || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0);

/**
 * Which file of each type and report date is the report of that day (D348): the one with the most of the needed columns
 * (for a CI report, the columns the checks read), then the most rows, then the one changed last, then the last file name. A file name never decides alone. The others are not
 * used, with the reason, in plain words. The answer is in the order of `files`.
 */
export function chooseReports(files: ChoiceFile[]): Choice[] {
  const keyOf = (file: ChoiceFile): string => `${file.kind}|${file.date}`;
  const groups = new Map<string, ChoiceFile[]>();
  for (const file of files) groups.set(keyOf(file), [...(groups.get(keyOf(file)) ?? []), file]);
  return files.map((file): Choice => {
    const best = [...groups.get(keyOf(file))!].sort(fuller)[0]!;
    if (best === file) return { name: file.name, used: true, whyNotUsed: '' };
    const why = best.columns !== file.columns
      ? `${best.name} of the same day has more of the needed columns (${best.columns} against ${file.columns}), so it is used.`
      : best.rows !== file.rows
        ? `${best.name} of the same day has more rows (${best.rows} against ${file.rows}), so it is used.`
        : `${best.name} of the same day has the same columns and rows and is used (${best.modified !== file.modified ? 'it was saved later' : 'the last file name'}). Move this copy into the sub-folder Archive.`;
    return { name: file.name, used: false, whyNotUsed: `Not used: ${why}` };
  });
}
