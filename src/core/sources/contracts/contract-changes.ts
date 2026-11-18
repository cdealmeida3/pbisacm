import { daysBetween, longDate } from '../../shared/dates.ts';
import { inList, sameWord } from './contract-reports.ts';
import type { ContractConfig, SolusiContract } from './contract-reports.ts';

/**
 * The page "Contract changes": what changed between the newest Solusi contract file and the one loaded before it, and
 * the running contracts that end soon or have no daily responsible. For information only: no cases, no messages.
 */


/* ------------------------------------------------------------------ what changed since the last Solusi contract file */

export interface ContractChange { number: string; name: string; vendor: string; what: string; before: string; after: string }

export interface ContractChanges {
  /** Dates of the two Solusi contract files compared ('' when there is no earlier file). */
  from: string;
  to: string;
  added: SolusiContract[];
  left: SolusiContract[];
  /** Status changes, and every other changed field with the value before and after. */
  status: ContractChange[];
  fields: ContractChange[];
}

/** The fields compared between two Solusi contract files, in the order of the page (also read by the Power BI report). */
export const CHANGE_FIELDS: Array<{ field: keyof SolusiContract; label: string; date?: boolean }> = [
  { field: 'name', label: 'Name' }, { field: 'vendor', label: 'Vendor' }, { field: 'vendorNumber', label: 'Vendor number' }, { field: 'category', label: 'Category' },
  { field: 'start', label: 'Start date', date: true }, { field: 'end', label: 'End date', date: true }, { field: 'duration', label: 'Duration type' },
  { field: 'owner', label: 'Contract owner' }, { field: 'dailyResponsible', label: 'Daily responsible' }, { field: 'procurementPartner', label: 'Procurement partner' },
  { field: 'epoId', label: 'EPO ID' }
];

/**
 * What changed between two Solusi contract files (the one loaded before, and the newest): new contracts, contracts that
 * left, status changes and every changed field. It replaces the Excel "Latest Updates Check". `previous` null: the first file.
 */
export function contractChanges(previous: { contracts: SolusiContract[]; date: string } | null, current: { contracts: SolusiContract[]; date: string }): ContractChanges {
  const out: ContractChanges = { from: previous?.date ?? '', to: current.date, added: [], left: [], status: [], fields: [] };
  if (!previous) return out;
  const before = new Map<string, SolusiContract>();
  for (const contract of previous.contracts) before.set(contract.number.toLowerCase(), contract);
  const now = new Set(current.contracts.map((contract) => contract.number.toLowerCase()));
  const words = (value: string, date?: boolean): string => (value ? (date ? longDate(value) : value) : 'empty');
  for (const contract of current.contracts) {
    const old = before.get(contract.number.toLowerCase());
    if (!old) { out.added.push(contract); continue; }
    const line = (what: string, was: string, is: string): ContractChange => ({ number: contract.number, name: contract.name, vendor: contract.vendor, what, before: was, after: is });
    if (!sameWord(old.status, contract.status) || old.sheet !== contract.sheet) {
      const tab = (item: SolusiContract): string => (item.sheet === 'terminated' ? ' (terminated in the last 7 days)' : '');
      out.status.push(line('Status', `${words(old.status)}${tab(old)}`, `${words(contract.status)}${tab(contract)}`));
    }
    for (const entry of CHANGE_FIELDS) {
      const was = String(old[entry.field] ?? '');
      const is = String(contract[entry.field] ?? '');
      if (entry.date ? was !== is : !sameWord(was, is)) out.fields.push(line(entry.label, words(was, entry.date), words(is, entry.date)));
    }
  }
  out.left = previous.contracts.filter((contract) => !now.has(contract.number.toLowerCase()));
  return out;
}

/** For information on the page "Contract changes": running contracts that end soon, and running contracts with no daily responsible. Nobody is asked. */
export function contractInformation(contracts: SolusiContract[], date: string, config: ContractConfig): { ending: Array<{ days: number; contracts: SolusiContract[] }>; noDailyResponsible: SolusiContract[] } {
  const active = contracts.filter((contract) => contract.sheet === 'active');
  const concluded = active.filter((contract) => inList(config.concludedStatuses, contract.status));
  const ending = config.endsWithinDays.slice().sort((a, b) => a - b).map((days) => ({
    days, contracts: concluded.filter((contract) => { const left = contract.end && date ? daysBetween(date, contract.end) : NaN; return Number.isFinite(left) && left >= 0 && left <= days; })
      .sort((a, b) => a.end.localeCompare(b.end))
  }));
  return { ending, noDailyResponsible: active.filter((contract) => inList(config.runningStatuses, contract.status) && !contract.dailyResponsible) };
}
