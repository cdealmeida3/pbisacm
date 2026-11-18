import { recogniseAmong } from '../reading/table.ts';
import type { Recognised } from '../reading/table.ts';
import { CI_REPORT } from './ci/ci-report.ts';
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

/** The type of a report, from its header row (see recogniseAmong in src/core/reading/table.ts). */
export const recogniseReport = (headerRow: string[]): Recognised<KnownReportType> => recogniseAmong(headerRow, REPORT_TYPES);

/**
 * The last branch of every "one branch per report type" in the hosts (saving and removing a load, the command line). Its
 * argument (the kind, or the type) has the type `never`, so when a new type is listed in REPORT_TYPES the type check (`npm run typecheck`) names
 * each branch that still lacks it, and a new type is never read as a CI report by mistake.
 */
export function unhandledKind(kind: never): never {
  const name: unknown = typeof kind === 'object' && kind ? (kind as { kind?: unknown }).kind : kind;
  throw new Error(`No branch for the report type "${String(name)}".`);
}
