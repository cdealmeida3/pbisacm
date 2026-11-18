import { longDate } from '../../core/shared/dates.ts';
import type { Run } from '../../core/cases/cases.ts';
import type { ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';

/**
 * What the contract cards show besides their cases (version 0.16).
 */

/**
 * The first question of a contract card, "was this Solusi file uploaded?": the dates of the two files the checks compared.
 * '' when the run used no contract files.
 */
export function contractFilesLine(run: Run | undefined, solusi: SolusiRun | null, contracts: ContractRun | null): string {
  if (!run || !run.solusiReport || !run.contractReport) return '';
  const of = (report: string, loaded: SolusiRun | ContractRun | null): string => (loaded && loaded.report === report ? `of ${longDate(loaded.date)}` : `"${report}"`);
  return `Compared: the Solusi contract file ${of(run.solusiReport, solusi)} with the ServiceNow contract report ${of(run.contractReport, contracts)}.`;
}

/**
 * The text of Contract changes (F14): the comparison, or why there is none. `unloaded`: the date of the newest earlier
 * Solusi contract file that is in the folder but was never loaded ('' when there is none).
 */
export function changesText(to: string, from: string, total: number, unloaded: string): string {
  if (from) return `The Solusi contract file of ${longDate(to)} compared with the one of ${longDate(from)}: ${total} ${total === 1 ? 'change' : 'changes'}. For information: nothing is asked and no message is written.`;
  if (unloaded) return `An earlier Solusi contract file (of ${longDate(unloaded)}) is in the folder but was not loaded. Load it with Choose reports to compare.`;
  return `The Solusi contract file of ${longDate(to)} is the first one in the folder, so there is nothing to compare yet. The next file shows what changed.`;
}
