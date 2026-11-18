import { longDate } from '../../core/shared/dates.ts';
import { fixRows } from './fix-list.ts';
import type { Case } from '../../core/cases/cases.ts';
import type { CheckPack } from '../../core/model/model.ts';
import type { ContractChanges } from '../../core/sources/contracts/contract-changes.ts';
import type { SolusiContract } from '../../core/sources/contracts/contract-reports.ts';
import type { CiPeople, Person } from './people.ts';
import type { BacklogLine } from './backlog.ts';
import { CAPABILITY_COLUMNS } from '../../core/mapping/capability-sheet.ts';
import type { CapabilityRow } from '../../core/mapping/capability-sheet.ts';

/**
 * The CSV files the screens offer: Export this list (CIs or contracts), Export fix list, the page Contract changes, the
 * mapping backlog and the capability sheet.
 * Every file starts with a byte order mark and uses CRLF, so Excel opens it with the right letters.
 */

/** A cell of a CSV file. A value that could be read as a formula gets a leading apostrophe. */
const csvCell = (value: string): string => {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
};

/** The columns of the export of a contract card: the tables of the message For Procurement as one file. */
export const CONTRACT_EXPORT_COLUMNS = ['Problem', 'Contract number', 'Name', 'Vendor', 'What we found', 'What is asked', 'Status'] as const;

/** A list of contract findings as CSV: one line per finding, in the order of the message (by kind of problem, then by contract number). */
export function exportContractCsv(cases: Case[], packs: CheckPack[] = []): string {
  const packOf = (id: string): CheckPack | undefined => packs.filter((pack) => pack.id === id)[0];
  const kinds = (item: Case): string[] => Object.keys(packOf(item.fact.checkId)?.playbook.message?.byProblem ?? {});
  const kind = (item: Case): string => item.fact.field.split('.')[0]!;
  const rank = (item: Case): number => { const index = kinds(item).indexOf(kind(item)); return index < 0 ? kinds(item).length : index; };
  const lines = cases.slice().sort((a, b) => a.fact.checkId.localeCompare(b.fact.checkId) || rank(a) - rank(b) || (a.fact.group ?? '').localeCompare(b.fact.group ?? '')
    || a.fact.ci!.contract!.number.localeCompare(b.fact.ci!.contract!.number)).map((item) => {
    const contract = item.fact.ci!.contract!;
    const message = packOf(item.fact.checkId)?.playbook.message;
    const ask = message ? message.byProblem?.[kind(item)]?.ask ?? message.ask : '';
    return [item.fact.group ?? '', contract.number, contract.name, contract.vendor, item.fact.detail, ask, item.status].map(csvCell).join(',');
  });
  return `\uFEFF${[CONTRACT_EXPORT_COLUMNS.map(csvCell).join(',')].concat(lines).join('\r\n')}\r\n`;
}

/** The columns of the SACM email template, for Export this list. */
export const EXPORT_COLUMNS = ['Name', 'EPO ID', 'Class', 'Owned by', 'Managed by', 'Operational status', 'Support group', 'Tags', 'What we found'] as const;

/**
 * A list of cases as CSV: one line per CI, the columns of the SACM template, and the tags of the CI (D151; runs saved before version 0.20 have none). Starts with a byte order mark and uses CRLF,
 * so Excel opens it with the right letters. A cell that could be read as a formula gets a leading apostrophe.
 */
export function exportCsv(cases: Case[], people: Map<string, CiPeople>, packs: CheckPack[] = []): string {
  if (cases.length && cases.every((item) => item.fact.ci?.contract)) return exportContractCsv(cases, packs);
  const cell = csvCell;
  const byCi = new Map<string, Case[]>();
  for (const item of cases) byCi.set(item.fact.ciKey, (byCi.get(item.fact.ciKey) ?? []).concat([item]));
  const named = (person: Person | undefined): string => person ? `${person.name}${person.active === false ? ' (inactive)' : ''}` : '';
  const lines = Array.from(byCi.values()).sort((a, b) => a[0]!.fact.ciName.localeCompare(b[0]!.fact.ciName)).map((items) => {
    const fact = items[0]!.fact;
    const roles = people.get(fact.ciKey);
    return [
      fact.ciName, fact.ci?.epoId ?? '', fact.classLabel, roles ? named(roles.owned_by) : fact.ci?.ownedBy ?? '', roles ? named(roles.managed_by) : fact.ci?.managedBy ?? '',
      fact.ci?.status ?? '', fact.ci?.supportGroup ?? '', (fact.ci?.tags ?? []).join(', '), Array.from(new Set(items.map((item) => item.fact.detail))).join('; ')
    ].map(cell).join(',');
  });
  return `\uFEFF${[EXPORT_COLUMNS.map(cell).join(',')].concat(lines).join('\r\n')}\r\n`;
}

export const FIX_COLUMNS = ['Name', 'EPO ID', 'Class', 'Change', 'Current value', 'Value to set', 'Note', 'Status', 'Marked fixed by', 'Marked fixed on'] as const;

/** Export fix list: one line per change, to work through in ServiceNow. Same CSV rules as exportCsv. */
export function exportFixCsv(cases: Case[]): string {
  const cell = csvCell;
  const lines = fixRows(cases).map((row) => [
    row.ciName, row.item.fact.ci?.epoId ?? '', row.classLabel, row.change, row.current, row.set, row.note, row.item.status,
    row.fixed ? row.fixed.byName : '', row.fixed ? row.fixed.at.slice(0, 16).replace('T', ' ') : ''
  ].map(cell).join(','));
  return `\uFEFF${[FIX_COLUMNS.map(cell).join(',')].concat(lines).join('\r\n')}\r\n`;
}

/** The columns of the export of the page Contract changes. */
export const CHANGE_COLUMNS = ['Change', 'Contract number', 'Name', 'Vendor', 'Field', 'Before', 'After'] as const;

/** The page Contract changes as CSV: new contracts, contracts that left, status changes and changed fields. */
export function changesCsv(changes: ContractChanges): string {
  const whole = (contract: SolusiContract): string => [contract.status, contract.start && `starts ${longDate(contract.start)}`, contract.end && `ends ${longDate(contract.end)}`].filter(Boolean).join(', ');
  const lines: string[][] = [];
  for (const contract of changes.added) lines.push(['New contract', contract.number, contract.name, contract.vendor, '', '', whole(contract)]);
  for (const contract of changes.left) lines.push(['No longer in the file', contract.number, contract.name, contract.vendor, '', whole(contract), '']);
  for (const change of changes.status) lines.push(['Status change', change.number, change.name, change.vendor, change.what, change.before, change.after]);
  for (const change of changes.fields) lines.push(['Changed field', change.number, change.name, change.vendor, change.what, change.before, change.after]);
  return `\uFEFF${[CHANGE_COLUMNS.map(csvCell).join(',')].concat(lines.map((line) => line.map(csvCell).join(','))).join('\r\n')}\r\n`;
}

/** The columns of Export on the mapping backlog. */
export const BACKLOG_COLUMNS = ['Name', 'Class', 'Owner', 'Why', 'Stage', 'Since', 'State', 'Criticality lines', 'Process Management told'] as const;

/** The mapping backlog as CSV, one line per CI, in the order of the page. `stateWord` gives the word of a state ("To solve"). */
export function exportBacklogCsv(lines: BacklogLine[], stateWord: (state: string) => string): string {
  const rows = lines.map((line) => [
    line.item.fact.ciName, line.item.fact.classLabel, line.owner, line.reasons.join('; '), line.stage.label, longDate(line.item.firstSeen), stateWord(line.state),
    line.criticality.join(', '), line.toldOn ? longDate(line.toldOn) : line.processMissing ? 'Not yet' : ''
  ].map(csvCell).join(','));
  return `﻿${[BACKLOG_COLUMNS.map(csvCell).join(',')].concat(rows).join('\r\n')}\r\n`;
}

/** The capability sheet (D205) as CSV: the columns of CAPABILITY_COLUMNS, one line per capability. */
export function exportCapabilityCsv(rows: CapabilityRow[]): string {
  return `﻿${[CAPABILITY_COLUMNS.map(csvCell).join(',')].concat(rows.map((row) => row.map(csvCell).join(','))).join('\r\n')}\r\n`;
}
