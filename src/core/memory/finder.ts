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
