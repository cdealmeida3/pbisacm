import { plural } from '../../shared/text.ts';
import { reportDate } from '../../shared/dates.ts';
import { nameKey } from '../../shared/names.ts';
import { normaliseHeader } from '../../reading/headers.ts';
import type { Ci, References, Role } from '../../model/model.ts';
import type { ReportType } from '../../reading/table.ts';

/**
 * The EPO systems report, compared with the CI report (Operational Activities Instruction 2.7). Pure.
 *
 * The report holds every EPO system, one line each: EPO ID, name, description (HTML), status, the three people (user IDs)
 * and when the system last changed. A system matches the Service Instance whose Asset tag is its EPO ID. What the columns
 * are called, what the status words mean and the " - PROD" rule are data: checks/reference/epo-systems-report.json.
 *
 * Compared: status, name, the three people and the description (loosely, by letters and digits). The fix is always made in
 * EPO. A service mapped CI is then updated in ServiceNow by SACM by hand (card "EPO ≠ ServiceNow", a SACM fix list); for
 * the others ServiceNow follows EPO by itself, so a difference means the update did not arrive (card "EPO update not
 * arrived", a review list). The cards are in src/core/checks/detectors/epo-detectors.ts. A role that is empty in EPO while
 * ServiceNow still shows a person is a leftover: it is not on these cards, the owner is asked to fill the role in EPO
 * (src/core/checks/source-first.ts). Nothing here sends or changes anything.
 */

/** The EPO systems report: known by its EPO ID, System name and System status columns. */
export const EPO_REPORT: ReportType<'epo'> = {
  kind: 'epo', label: 'EPO systems report', hint: 'EPO: every system, its status and its people, to compare with ServiceNow',
  needs: [
    { label: 'EPO ID', any: ['epoid', 'epo_id'] },
    { label: 'System name', any: ['systemname', 'system_name'] },
    { label: 'System status', any: ['systemstatus', 'system_status'] }
  ],
  folder: 'epo'
};

export const EPO_REF = 'reference/epo-systems-report';

export type EpoColumn = 'epoId' | 'name' | 'description' | 'status' | 'department' | 'owner' | 'responsible1' | 'responsible2' | 'changed';
export type EpoPersonColumn = 'owner' | 'responsible1' | 'responsible2';

export interface EpoConfig {
  /** The header forms of each column (after normaliseHeader). */
  columns: Record<EpoColumn, string[]>;
  /** EPO status word → ServiceNow Operational status. */
  statuses: Record<string, string>;
  /** The ServiceNow classes a system matches (by Asset tag = EPO ID). */
  classes: string[];
  /** The name of the Service Instance is the EPO name plus this. */
  nameSuffix: string;
  /** ServiceNow statuses that count as Retired (a pair Retired on both sides is not compared). */
  retiredStatuses: string[];
  /** The people: the ServiceNow role, the EPO column, and the EPO word for it. */
  roles: Array<{ role: Role; column: EpoPersonColumn; label: string; epoLabel: string }>;
  /** "EPO update not arrived": a difference younger than this (days between the EPO change and the CI report) waits. */
  waitDays: number;
  /** Descriptions: how many letters and digits at the start must be the same. */
  descriptionStart: number;
  /**
   * The source first (D190): the people lines of these checks are compared with EPO before anybody is asked
   * (src/core/checks/source-first.ts). Missing: the lines are not compared, and a leftover stays on the EPO cards.
   */
  sourceFirst?: SourceFirstConfig;
}

export interface SourceFirstConfig {
  /** The checks with one line per role (the field of the finding is the role). */
  checks: string[];
  /** The checks about the same person in two roles (Owned by and Managed by). */
  samePerson: string[];
  /** The check that gets the line of a leftover whose old person is still active, by role. */
  leftover: Partial<Record<Role, string>>;
  /** The cards a waiting line names: where SACM copies EPO (service mapped), and where the sync is followed (not service mapped). */
  cards: { mapped: string; notMapped: string };
}

export interface EpoSystem {
  epoId: string;
  name: string;
  /** Plain text: the HTML of EPO without tags. */
  description: string;
  /** The ServiceNow word for the EPO status ('' when the word is not known; see statusWord). */
  status: string;
  statusWord: string;
  department: string;
  /** User IDs, as EPO has them ('' = nobody). */
  owner: string;
  responsible1: string;
  responsible2: string;
  /** Last change in EPO: yyyy-mm-dd, '' when not readable. */
  changed: string;
}

/** An EPO systems report as saved in the workspace (data/runs/epo/). No who or when: that is in the journal. */
export interface EpoRun {
  kind: 'epo';
  date: string;
  report: string;
  loadedBy?: string;
  loadedByName?: string;
  loadedAt?: string;
  systems: EpoSystem[];
  notes: string[];
}

/** What the checks need of an EPO report: its systems, its date, and the date of the EPO report loaded before it. */
export interface EpoInput { systems: EpoSystem[]; date: string; report: string; previousDate: string }

export function epoConfig(references: References): EpoConfig | null {
  const config = references[EPO_REF] as EpoConfig | undefined;
  return config && config.columns && config.statuses && Array.isArray(config.roles) ? config : null;
}

/* ------------------------------------------------------------------ reading */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

/** HTML as plain text: tags removed, entities decoded, spaces squashed. The export writes quotes in attributes as "{Q}". */
export function plainText(html: string): string {
  return html
    .replace(/\{Q\}/g, '"')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
      if (code[0] === '#') {
        const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(value) && value > 0 ? String.fromCodePoint(value) : all;
      }
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Letters and digits only, lower case: EPO keeps formatting, ServiceNow plain text, so only the words are compared. */
export const lettersOf = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export interface EpoRead { systems: EpoSystem[]; skipped: number; notes: string[] }

export function readEpoReport(rows: string[][], config: EpoConfig): EpoRead {
  const headers = (rows[0] ?? []).map(normaliseHeader);
  const at = {} as Record<EpoColumn, number>;
  for (const column of Object.keys(config.columns) as EpoColumn[]) at[column] = headers.findIndex((header) => config.columns[column].indexOf(header) >= 0);
  const notes: string[] = [];
  const missing = (Object.keys(at) as EpoColumn[]).filter((column) => at[column] < 0);
  if (missing.length) notes.push(`The EPO systems report has no column for ${missing.join(', ')}. What needs it is not compared.`);
  const statusWords = new Map<string, string>();
  for (const word of Object.keys(config.statuses)) statusWords.set(nameKey(word), config.statuses[word]!);

  const systems: EpoSystem[] = [];
  const unknown = new Set<string>();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const cell = (column: EpoColumn): string => (at[column] < 0 ? '' : (row[at[column]] ?? '').trim());
    const epoId = cell('epoId');
    if (!epoId) { skipped += 1; continue; }
    const word = cell('status');
    const status = statusWords.get(nameKey(word)) ?? '';
    if (word && !status) unknown.add(word);
    systems.push({
      epoId, name: cell('name'), description: plainText(cell('description')), status, statusWord: word, department: cell('department'),
      owner: cell('owner'), responsible1: cell('responsible1'), responsible2: cell('responsible2'), changed: reportDate(cell('changed'))
    });
  }
  if (skipped) notes.push(`${plural(skipped, 'row')} ${skipped === 1 ? 'has' : 'have'} no EPO ID and ${skipped === 1 ? 'was' : 'were'} left out.`);
  if (unknown.size) notes.push(`Status words not known: ${Array.from(unknown).sort().join(', ')}. Their status is not compared. Add them to reference/epo-systems-report.`);
  return { systems, skipped, notes };
}

/* ------------------------------------------------------------------ comparing */

export interface Difference {
  /** 'status', 'name', a role ('owned_by' …) or 'description'. */
  field: string;
  label: string;
  /** What ServiceNow and EPO show, in words. */
  current: string;
  epo: string;
  /** The EPO value as it is typed in ServiceNow: the status word, the whole name, the person's name (else user ID), the whole description. '' when EPO has nobody. */
  value: string;
  /**
   * A leftover (D190): EPO has nobody in the role and ServiceNow still shows a person, because the sync never clears a
   * field. Nobody clears it by hand: the owner is asked to fill the role in EPO, so it is not on the EPO cards.
   */
  leftover?: boolean;
}

export interface Pair {
  ci: Ci;
  system: EpoSystem;
  /** The service mapped flag of the CI (null: the report has no column). */
  mapped: boolean | null;
  differences: Difference[];
}

export interface Comparison {
  pairs: Pair[];
  /** EPO systems that are not Retired and match no CI of the classes. */
  withoutCi: EpoSystem[];
  /** Pairs Retired on both sides, not compared. */
  retiredBoth: number;
  /** What could not be compared, in words. */
  notes: string[];
}

/** The name of a person in ServiceNow from their user ID, from every person the CI report names. */
export function userNames(cis: Ci[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const ci of cis) {
    for (const person of Object.values(ci.roles)) {
      if (!person || !person.userId) continue;
      const id = person.userId.trim().toLowerCase();
      if (!names.has(id) && person.name) names.set(id, person.name);
    }
  }
  return names;
}

/** "Jane Doe (jdo)", or the user ID alone when ServiceNow does not know it, or "nobody". */
export function personWords(userId: string, names: Map<string, string>): string {
  if (!userId) return 'nobody';
  const name = names.get(userId.trim().toLowerCase());
  return name ? `${name} (${userId.trim().toLowerCase()})` : userId.trim().toLowerCase();
}

/** What a description difference is, in words (see descriptionDifference). */
export const DESCRIPTION_WORDS: Record<'empty' | 'cut' | 'start', string> = {
  empty: 'empty in ServiceNow, EPO has one',
  cut: 'stops before the end of the EPO text',
  start: 'starts differently from the EPO text'
};

/** The start of a long text, for a table cell. */
const startOf = (text: string): string => (text.length > 120 ? `${text.slice(0, 117)}…` : text);

/**
 * Matches the systems to the CIs (EPO ID = Asset tag) and lists what differs: status, name, the three people and, when the
 * CI report has its column, the description (D105: empty in ServiceNow, cut short, or another start).
 */
export function compareEpo(cis: Ci[], systems: EpoSystem[], columns: Set<string>, config: EpoConfig): Comparison {
  const retired = (status: string): boolean => config.retiredStatuses.some((value) => nameKey(value) === nameKey(status));
  const byTag = new Map<string, Ci[]>();
  for (const ci of cis) {
    if (config.classes.indexOf(ci.className) < 0 || !ci.assetTag) continue;
    const tag = ci.assetTag.trim().toLowerCase();
    byTag.set(tag, (byTag.get(tag) ?? []).concat([ci]));
  }
  const names = userNames(cis);
  const roles = config.roles.filter((entry) => columns.has(`${entry.role}.userId`) || columns.has(entry.role));
  const notes: string[] = [];
  const unread = config.roles.filter((entry) => roles.indexOf(entry) < 0);
  if (unread.length) notes.push(`The CI report has no column for ${unread.map((entry) => entry.label).join(', ')}, so ${unread.length === 1 ? 'it is' : 'they are'} not compared.`);
  const noUserId = roles.filter((entry) => !columns.has(`${entry.role}.userId`));
  if (noUserId.length) notes.push(`The CI report has no user ID column for ${noUserId.map((entry) => entry.label).join(', ')} (${noUserId.map((entry) => `${entry.role}.user_name`).join(', ')}): EPO names people by user ID, so ${noUserId.length === 1 ? 'it is' : 'they are'} not compared.`);
  const compared = roles.filter((entry) => columns.has(`${entry.role}.userId`));
  const descriptions = columns.has('description');
  if (!descriptions) notes.push('The CI report has no description column (short_description), so the description is not compared.');

  const pairs: Pair[] = [];
  const withoutCi: EpoSystem[] = [];
  let retiredBoth = 0;
  for (const system of systems) {
    let found = byTag.get(system.epoId.trim().toLowerCase()) ?? [];
    if (found.length > 1) { const live = found.filter((ci) => !retired(ci.operationalStatus)); if (live.length) found = live; }
    const ci = found[0];
    const epoRetired = !!system.status && retired(system.status);
    if (!ci) { if (!epoRetired) withoutCi.push(system); continue; }
    if (epoRetired && retired(ci.operationalStatus)) { retiredBoth += 1; continue; }
    const differences: Difference[] = [];
    if (system.status && nameKey(system.status) !== nameKey(ci.operationalStatus)) {
      differences.push({ field: 'status', label: 'Operational status', current: ci.operationalStatus || 'empty', epo: `${system.status} (${system.statusWord})`, value: system.status });
    }
    if (system.name && nameKey(ci.name) !== nameKey(`${system.name}${config.nameSuffix}`)) {
      differences.push({ field: 'name', label: 'Name', current: ci.name, epo: `${system.name}${config.nameSuffix}`, value: `${system.name}${config.nameSuffix}` });
    }
    for (const entry of compared) {
      const person = ci.roles[entry.role];
      const now = (person?.userId ?? '').trim().toLowerCase();
      const epo = system[entry.column].trim().toLowerCase();
      if (now === epo) continue;
      // A person without user ID in ServiceNow, but named: compare by name is not possible, say it as it is.
      const shown = now ? personWords(now, names) : person && (person.name || person.email) ? `${person.name || person.email} (no user ID)` : 'nobody';
      differences.push({ field: entry.role, label: entry.label, current: shown, epo: personWords(epo, names), value: epo ? names.get(epo) || epo : '', ...(!epo && config.sourceFirst ? { leftover: true } : {}) });
    }
    const kind = descriptions ? descriptionDifference(ci, system, config) : '';
    if (kind) {
      differences.push({ field: 'description', label: `Description (${DESCRIPTION_WORDS[kind]})`, current: ci.description ? `"${startOf(ci.description)}"` : 'empty', epo: `"${startOf(system.description)}"`, value: system.description });
    }
    pairs.push({ ci, system, mapped: ci.serviceMapped, differences });
  }
  return { pairs, withoutCi, retiredBoth, notes };
}

/** How the description of a CI differs from EPO, by letters and digits only. '' when the same or when only later words differ. */
export function descriptionDifference(ci: Ci, system: EpoSystem, config: EpoConfig): '' | 'empty' | 'cut' | 'start' {
  const epo = lettersOf(system.description);
  const now = lettersOf(ci.description);
  if (!epo || now === epo) return '';
  if (!now) return 'empty';
  if (epo.startsWith(now)) return 'cut';
  const start = Math.max(1, config.descriptionStart);
  if (now.slice(0, start) !== epo.slice(0, start)) return 'start';
  return '';
}

/* ------------------------------------------------------------------ after a fix: what the EPO report shows */

/** A person as the run keeps them (see Person in src/app/view/people.ts): `id` is the user ID, else the email, lower case. */
interface PersonLike { id: string; name: string }

/**
 * "Corrected in EPO": a case asks a person to correct a role (or the description) of a CI that EPO feeds, and the EPO
 * report now shows another value than ServiceNow, changed on or after `since` (the first message, else when the case was
 * first seen). Returns the date and the EPO value in words, or null. Only shown: nothing is sent and nothing is changed.
 */
export function correctedInEpo(field: string, system: EpoSystem | undefined, people: Partial<Record<string, PersonLike>> | undefined, description: string | undefined, since: string, config: EpoConfig, names: Map<string, string> = new Map()): { on: string; value: string } | null {
  if (!system || !system.changed || (since && system.changed < since.slice(0, 10))) return null;
  const role = config.roles.filter((entry) => entry.role === field)[0];
  if (role) {
    const epo = system[role.column].trim().toLowerCase();
    const now = (people?.[field]?.id ?? '').toLowerCase();
    if (!epo || epo === now) return null;
    return { on: system.changed, value: `${role.epoLabel} ${personWords(epo, names)}` };
  }
  if (field === 'description' && description !== undefined) {
    const epo = lettersOf(system.description);
    if (!epo || epo === lettersOf(description)) return null;
    return { on: system.changed, value: 'a new description' };
  }
  return null;
}

/** The EPO systems of a report by EPO ID (lower case). */
export function systemsById(systems: EpoSystem[]): Map<string, EpoSystem> {
  const byId = new Map<string, EpoSystem>();
  for (const system of systems) byId.set(system.epoId.trim().toLowerCase(), system);
  return byId;
}
