import { recogniseAmong } from '../reading/table.ts';
import type { Recognised, ReportType } from '../reading/table.ts';
import { CI_REPORT, missingWanted, readCiReport, WANTED_COLUMNS } from './ci/ci-report.ts';
import { normaliseHeader } from '../reading/headers.ts';
import { RELATIONSHIP_REPORT } from './relationships/relationship-report.ts';
import { EPO_REPORT } from './epo/epo-report.ts';
import { CONTRACT_REPORT, SOLUSI_FILE } from './contracts/contract-reports.ts';

/**
 * The one list of the report types the Workbench reads. Each is defined next to its reader, in its own folder of
 * src/core/sources/: its name, the columns it must have and its folder in the team folder. A new report type is a new
 * folder there and one line here; its checks are one family in src/core/checks/detectors/index.ts. The order is the
 * order of the tiles on the Reports strip.
 */
export const REPORT_TYPES = [CI_REPORT, RELATIONSHIP_REPORT, EPO_REPORT, SOLUSI_FILE, CONTRACT_REPORT];

export type ReportKind = (typeof REPORT_TYPES)[number]['kind'];
export type KnownReportType = (typeof REPORT_TYPES)[number];

export const reportType = (kind: string): KnownReportType | undefined => REPORT_TYPES.filter((type) => type.kind === kind)[0];

/**
 * Files the Workbench knows but does not use (D341, D342): they are listed on the Reports page by their name and never
 * called "not a report". A CMDB Health result is never the CI report of its day, even though it lists CIs: its columns
 * keep the "ci." prefix (`ci`, `ci.sys_class_name`), so it never has the Class column of a CI report. Each has its kind,
 * its name and the words that say why it is not used.
 */
export interface KnownFile extends ReportType { why: string }

export const KNOWN_FILES: readonly KnownFile[] = [
  {
    kind: 'health', label: 'CMDB Health result', hint: 'ServiceNow: the CIs a CMDB Health rule found (such as orphan CIs)',
    needs: [{ label: 'CI', any: ['ci'] }, { label: 'Class of the CI', any: ['ci.sys_class_name', 'ci.class'] }], folder: '',
    why: 'A CMDB Health result: known, not used yet. It is never the CI report.'
  },
  {
    kind: 'links', label: 'Contract–CI links', hint: 'ServiceNow: which CIs each contract covers',
    needs: [{ label: 'Contract', any: ['ast_contract', 'contract'] }, { label: 'Configuration item', any: ['ci_item', 'configuration_item'] }], folder: '',
    why: 'The links between contracts and CIs: known, not used yet. The ServiceNow contract report is the export of the contracts table (ast_contract).'
  }
];

/**
 * The type of a report, from its header row (see recogniseAmong in src/core/reading/table.ts). A file of no report type
 * that is a known file (KNOWN_FILES) has no type, its `known` and its words as the message.
 */
export function recogniseReport(headerRow: string[]): Recognised<KnownReportType> & { known?: KnownFile } {
  const found = recogniseAmong(headerRow, REPORT_TYPES);
  if (found.type) return found;
  const known = recogniseAmong(headerRow, KNOWN_FILES).type;
  return known ? { type: null, known, message: known.why } : found;
}

/**
 * The last branch of every "one branch per report type" in the hosts (saving and removing a load, the command line). Its
 * argument (the kind, or the type) has the type `never`, so when a new type is listed in REPORT_TYPES the type check (`npm run typecheck`) names
 * each branch that still lacks it, and a new type is never read as a CI report by mistake.
 */
export function unhandledKind(kind: never): never {
  const name: unknown = typeof kind === 'object' && kind ? (kind as { kind?: unknown }).kind : kind;
  throw new Error(`No branch for the report type "${String(name)}".`);
}

/** The kind of a file as the Reports page lists it: a report type, a known file (KNOWN_FILES), or "unknown". */
export function fileKind(headerRow: string[]): string {
  const found = recogniseReport(headerRow);
  return found.type?.kind ?? found.known?.kind ?? 'unknown';
}

/** A file of the reports folder, read: its kind (fileKind), whether it is the report of its type and day (chooseReports). */
export interface FolderFile {
  name: string;
  /** The report date, yyyy-mm-dd ('' when not known). */
  date: string;
  kind: string;
  used: boolean;
  /** Why a file of a report type is not used (chooseReports), else ''. */
  whyNotUsed: string;
  /** Why a file of no report type is not read (recogniseReport), else ''. */
  message: string;
}

/**
 * One line of "What to fix in the folder" (the Reports page, D352). `name`: the file, or "No <type>" for a type with no
 * file, so every line has its own name (the page sorts the lines by it, in the order of the box). `level`: 'fix' to act
 * on, 'known' to know.
 */
export interface FolderFix { name: string; date: string; readAs: string; what: string; level: 'fix' | 'known' }

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What to fix in the reports folder, in the order of the box (D352): each report type with no file, the columns the
 * newest CI report lacks (missingWanted, one line to copy into the ServiceNow report, D347), every file of a report type
 * that is not used, every file of no type, then the files the Workbench knows but does not use. Empty when the folder
 * needs nothing.
 */
/**
 * The columns that make one file of a type fuller than another of the same day (D348, rule 2 of the plan): for a CI
 * report the columns the checks read (WANTED_COLUMNS) that it has, for any other type its distinct named columns.
 */
/** The name of the line that holds only the columns to add, to copy. */
export const COLUMNS_TO_ADD = 'Columns to add';

export function neededColumns(kind: string, headers: string[]): number {
  if (kind === CI_REPORT.kind) return WANTED_COLUMNS.length - missingWanted(readCiReport([headers]).columns).length;
  return new Set(headers.map((header) => normaliseHeader(header.replace(/^\uFEFF/, ''))).filter(Boolean)).size;
}

export function folderFixes(files: FolderFile[], newestCi: { name: string; date: string; missing: string[] } | null): FolderFix[] {
  const fixes: FolderFix[] = [];
  for (const type of REPORT_TYPES) {
    if (!files.some((file) => file.kind === type.kind && file.used)) {
      fixes.push({ name: `No ${type.label}`, date: '', readAs: type.label, what: 'No file of this type in the folder, so the cards that need it are grey. Add the report to the folder.', level: 'fix' });
    }
  }
  if (newestCi && newestCi.missing.length) {
    const count = newestCi.missing.length;
    fixes.push({
      name: newestCi.name, date: newestCi.date, readAs: CI_REPORT.label,
      what: `Lacks ${plural(count, 'column')} the checks read, so some cards are grey or partly tested. Add ${count === 1 ? 'it' : 'them'} to the ServiceNow report: copy the next line (right-click it, Copy, Copy value).`,
      level: 'fix'
    });
    // The columns alone, so a copy of the cell is the list and nothing else (D347).
    fixes.push({ name: COLUMNS_TO_ADD, date: newestCi.date, readAs: CI_REPORT.label, what: newestCi.missing.join(', '), level: 'fix' });
  }
  const byName = (a: FolderFile, b: FolderFile): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const label = (kind: string): string => reportType(kind)?.label ?? KNOWN_FILES.find((known) => known.kind === kind)?.label ?? 'Not a report';
  const known = new Set(KNOWN_FILES.map((file) => file.kind));
  for (const file of files.filter((item) => !item.used && !known.has(item.kind)).sort(byName)) {
    fixes.push({ name: file.name, date: file.date, readAs: label(file.kind), what: reportType(file.kind) ? file.whyNotUsed : file.message, level: 'fix' });
  }
  for (const file of files.filter((item) => known.has(item.kind)).sort(byName)) {
    fixes.push({ name: file.name, date: file.date, readAs: label(file.kind), what: file.message, level: 'known' });
  }
  return fixes;
}
