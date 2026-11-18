import { isClosedStatus, ownerAsked } from '../../core/cases/cases.ts';
import type { Case } from '../../core/cases/cases.ts';
import type { CheckPack } from '../../core/model/model.ts';

/**
 * The SACM fix list: a check SACM fixes itself in ServiceNow shows a list of changes instead of messages.
 */

/** A check SACM fixes itself in ServiceNow: its card shows a fix list instead of messages. */
export const isFixList = (pack: CheckPack | undefined): boolean => pack?.playbook.path === 'sacm-fix';

/**
 * A line of a fix list that SACM handed to the owner (`playbook.askWhenUnsure`: "Cannot tell which one is right"): it
 * leaves the fix list and the owner is asked. On another check, false.
 */
export const handedToOwner = (pack: CheckPack | undefined, item: Case): boolean => !!pack?.playbook.askWhenUnsure && ownerAsked(item.timeline);

/**
 * Can the owner be written to about this case? Always, except on a fix list with `askWhenUnsure`: only once SACM handed
 * the line to the owner. (Whether it is to solve is asked separately.)
 */
export const askable = (pack: CheckPack | undefined, item: Case): boolean => !pack?.playbook.askWhenUnsure || ownerAsked(item.timeline);

/** Who marked a case as fixed, and when (the last "Fixed" status), or null. */
export function fixedBy(item: Case): { byName: string; at: string } | null {
  const marks = item.timeline.filter((event) => event.type === 'status');
  const last = marks[marks.length - 1];
  return last && last.text === 'Fixed' ? { byName: last.byName || last.by, at: last.at } : null;
}

export interface FixRow {
  item: Case; ciName: string; classLabel: string; change: string; current: string; set: string;
  /** The exact text to type in ServiceNow (D243): **Copy** copies it. '' when the value to set is an instruction, and in runs saved before version 0.33. */
  value: string;
  /** Information on the line ("Still linked: …"); '' when none. A line saved before version 0.20 has it as `check`. */
  note: string;
  fixed: { byName: string; at: string } | null;
}

/** The lines of a fix list: one per change, grouped by CI (A to Z). A note changes nothing in the order (D144). Cases without a fix line show their finding. */
export function fixRows(cases: Case[]): FixRow[] {
  return cases.map((item) => ({
    item, ciName: item.fact.ciName, classLabel: item.fact.classLabel,
    change: item.fact.fix?.change ?? item.fact.detail, current: item.fact.fix?.current ?? '', set: item.fact.fix?.set ?? '', value: item.fact.fix?.value ?? '',
    note: item.fact.fix?.note ?? (item.fact.fix?.check ?? '').replace(/^Still linked: check before deleting \((.*)\)$/, 'Still linked: $1'), fixed: fixedBy(item)
  })).sort((a, b) => a.ciName.localeCompare(b.ciName) || a.change.localeCompare(b.change));
}

/**
 * The lines of a fix list in their natural groups (F35): the kind of problem on a contract card, else the class. One
 * group, with no name, when every line is of the same one. Groups A to Z.
 */
export function fixGroups(rows: FixRow[]): Array<{ name: string; rows: FixRow[] }> {
  const groups = new Map<string, FixRow[]>();
  for (const row of rows) {
    const name = row.item.fact.group || row.classLabel;
    groups.set(name, (groups.get(name) ?? []).concat(row));
  }
  if (groups.size <= 1) return rows.length ? [{ name: '', rows }] : [];
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, list]) => ({ name, rows: list }));
}

/**
 * One record of a fix list (build W5, D242): a CI or a contract with every change to make on it, so SACM opens it once in
 * ServiceNow and sets every value. `open`: the lines still to mark; `marked`: marked and waiting for the next report.
 */
export interface FixRecord { key: string; ciName: string; classLabel: string; rows: FixRow[]; open: string[]; marked: string[]; assignedTo: string }

/** The lines of a fix list as records, in the order of the lines (A to Z by CI): one record per CI or contract. */
export function fixRecords(rows: FixRow[]): FixRecord[] {
  const records = new Map<string, FixRecord>();
  for (const row of rows) {
    const key = row.item.fact.ciKey;
    const record = records.get(key) ?? { key, ciName: row.ciName, classLabel: row.classLabel, rows: [], open: [], marked: [], assignedTo: '' };
    record.rows.push(row);
    if (!isClosedStatus(row.item.status)) (row.item.status === 'Fixed' ? record.marked : record.open).push(row.item.key);
    if (!record.assignedTo && !isClosedStatus(row.item.status)) record.assignedTo = row.item.assignedTo;
    records.set(key, record);
  }
  return Array.from(records.values());
}
