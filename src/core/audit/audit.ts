import { EXCEPTION, REVIEWED_ASK, caseState, checkedIn, exceptionRuns, standingCovers, stateOf } from '../cases/cases.ts';
import { runFileName } from '../memory/finder.ts';
import type { CaseEvent, Fact, Reply, Run } from '../cases/cases.ts';
import { checksInUse } from '../checks/engine.ts';
import type { CheckPack } from '../model/model.ts';

/**
 * The audit record: the verification record of each load, the audit export of a period, the
 * exceptions accepted, and the settings changes. The SACM procedure asks for verification records (date, verifier,
 * issues found) and an audit report (findings, actions taken, open issues). Pure: the app reads the files, this works out
 * what they say. Nothing here reads, writes or sends on its own; every function answers a button press.
 */

/* ------------------------------------------------------------------ CSV */

/**
 * CSV text for Excel: a byte order mark, CRLF, every cell quoted, and a leading apostrophe on a cell that could be read
 * as a formula. The same rules as Export this list.
 */
export function csvText(header: readonly string[], rows: Array<Array<string | number>>): string {
  const cell = (value: string | number): string => {
    const raw = String(value);
    const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return `﻿${[header.map(cell).join(',')].concat(rows.map((row) => row.map(cell).join(','))).join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ dates */

const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86400000);
/** Calendar days from `from` to `to` (both yyyy-mm-dd). */
export const daysBetween = (from: string, to: string): number => Math.max(0, dayNumber(to) - dayNumber(from));

/** The date `months` months after `iso` (yyyy-mm-dd); the 31st becomes the last day of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** A period of the audit export. Both ends are included. */
export interface Period { from: string; to: string }

/** The month of `iso` (`2026-11` → 1 to 30 November). */
export function monthPeriod(month: string): Period {
  const from = `${month.slice(0, 7)}-01`;
  return { from, to: lastDayOf(from) };
}
const lastDayOf = (first: string): string => {
  const [year, month] = first.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

/** The quarter that holds `iso`: Q4 2026 = 1 October to 31 December. */
export function quarterPeriod(iso: string): Period {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  const from = `${year}-${String(first).padStart(2, '0')}-01`;
  return { from, to: lastDayOf(`${year}-${String(first + 2).padStart(2, '0')}-01`) };
}

const inPeriod = (iso: string, period: Period): boolean => iso.slice(0, 10) >= period.from && iso.slice(0, 10) <= period.to;

/* ------------------------------------------------------------------ exceptions */

/**
 * The reasons SACM can stop following a finding for ("Not followed up"; an exception in the code, never a criticality exception) (as planned with SACM). The last one needs a note.
 * The real known exceptions of the SACM instruction (section 3.1) are entered in the team folder, never in the code.
 */
export const EXCEPTION_REASONS = ['Agreed with the owner', 'Known and tagged', 'Not a CI', 'Duplicate record', 'Other'] as const;
/** Default months until the review date; a team setting. */
export const EXCEPTION_MONTHS = 6;

/** One exception as the Exceptions page lists it: the last exception event for one case, or one standing exception. */
export interface ExceptionLine {
  /** What it is for: the case key, or "checkId|ciKey" for a standing one. */
  target: string;
  event: CaseEvent;
  checkId: string;
  ciKey: string;
  ciName: string;
  reason: string;
  note: string;
  reviewOn: string;
  byName: string;
  at: string;
  /** running: still in force; ended: the review date has passed; closed: a manager set another status after it. */
  state: 'running' | 'ended' | 'closed';
  /** Entered for a CI before any finding (no keys). */
  standing: boolean;
  /** An old "Waived" (before version 0.12): no reason, no review date. */
  legacy: boolean;
}

/**
 * Every exception, newest first. `events` is the whole journal as the app holds it; `facts` gives check and CI of a case
 * key (from the cases). An exception on several cases is listed once per case, because each can end on its own.
 */
export function exceptionLines(events: CaseEvent[], facts: Map<string, Pick<Fact, 'checkId' | 'ciKey' | 'ciName'>>, today: string): ExceptionLine[] {
  const sorted = events.slice().sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const last = new Map<string, CaseEvent>();
  const after = new Map<string, CaseEvent>();
  const isException = (event: CaseEvent): boolean => event.type === 'exception' || (event.type === 'status' && (event.text === 'Waived' || event.text === 'Exception accepted' || event.text === EXCEPTION));
  for (const event of sorted) {
    if (event.type === 'exception' && !event.keys.length && event.ciKey) { last.set(`${event.checkId ?? '*'}|${event.ciKey}`, event); after.delete(`${event.checkId ?? '*'}|${event.ciKey}`); continue; }
    for (const key of event.keys) {
      if (isException(event)) { last.set(key, event); after.delete(key); }
      else if (event.type === 'status' && last.has(key)) after.set(key, event);
    }
  }
  const lines: ExceptionLine[] = [];
  last.forEach((event, target) => {
    const standing = event.type === 'exception' && !event.keys.length;
    const fact = standing ? undefined : facts.get(target);
    const legacy = event.type === 'status';
    lines.push({
      target, event, standing, legacy,
      checkId: standing ? event.checkId ?? '*' : fact?.checkId ?? target.split(':')[0] ?? '',
      ciKey: standing ? event.ciKey ?? '' : fact?.ciKey ?? target.split(':')[1] ?? '',
      ciName: standing ? event.ciName ?? event.ciKey ?? '' : fact?.ciName ?? target.split(':')[1] ?? target,
      reason: legacy ? 'Set before version 0.12 (no reason)' : event.reason ?? '',
      note: legacy ? '' : event.text ?? '',
      reviewOn: event.reviewOn ?? '',
      byName: event.byName || event.by, at: event.at,
      state: after.has(target) ? 'closed' : exceptionRuns(event, today) ? 'running' : 'ended'
    });
  });
  return lines.sort((a, b) => b.at.localeCompare(a.at) || a.ciName.localeCompare(b.ciName) || a.target.localeCompare(b.target));
}

export const EXCEPTION_COLUMNS = ['CI', 'Check', 'Reason', 'Note', 'Decided by', 'Decided on', 'Review on', 'State'] as const;
const EXCEPTION_STATE: Record<ExceptionLine['state'], string> = { running: 'Not followed up', ended: 'Followed up again (review date passed)', closed: 'Followed up again (a later status)' };

/** The Not followed up page as CSV. `label` gives the card name of a check id. */
export function exceptionsCsv(lines: ExceptionLine[], label: (checkId: string) => string): string {
  return csvText(EXCEPTION_COLUMNS, lines.map((line) => [
    line.ciName, line.checkId === '*' ? 'Every check' : label(line.checkId), line.reason, line.note, line.byName,
    line.at.slice(0, 10), line.reviewOn || 'none', `${EXCEPTION_STATE[line.state]}${line.standing ? ', entered before any finding' : ''}`
  ]));
}

/** Words for the state of an exception line. */
export const exceptionStateWord = (line: ExceptionLine): string => EXCEPTION_STATE[line.state];

/* ------------------------------------------------------------------ verification record of one load */

/** One check in the verification record of a load. */
export interface CheckRecord {
  checkId: string;
  label: string;
  module: string;
  /** CIs (contracts, relationships: see `unit`) the check was evaluated on (the most of its fields). 0 when not tested. */
  tested: number;
  /** What `tested` counts. */
  unit: TestedUnit;
  /** The report could test the check (at least in part). `tested` may still be 0: nothing of its scope was in the report. */
  wasTested: boolean;
  /** Findings to solve (state open) and distinct CIs with one. */
  toSolve: number;
  toSolveCis: number;
  /** Findings listed but not to solve: waiting, known, to review. */
  other: number;
  /** To solve and not shown by the previous report. */
  newSince: number;
  /** Shown by the previous report, and no longer shown now on a CI this report contains and could test. */
  verifiedSince: number;
  /** What could not be tested, and why. Never empty when `tested` is 0. */
  notTested: string[];
}

/** What the number "Tested" of a check counts. */
export type TestedUnit = 'CI' | 'contract' | 'relationship';

/** The detectors that count relationships, not CIs. */
const RELATIONSHIP_DETECTORS = ['relationships/wrong-type'];

/** "214 CIs", "462 contracts", "1 relationship": the number tested with its unit. */
export const testedText = (check: Pick<CheckRecord, 'tested' | 'unit' | 'wasTested'>): string =>
  (check.wasTested ? `${check.tested.toLocaleString('en-GB')} ${check.unit}${check.tested === 1 ? '' : 's'}` : 'Not tested');

/** The checks of a verification record: every check that has a card and runs on a report (not the lifecycle review, not a check switched off). */
export const recordedChecks = (packs: CheckPack[]): CheckPack[] => checksInUse(packs).filter((pack) => pack.detector.type !== 'manual');

export interface VerificationRecord {
  date: string;
  report: string;
  /** Who loaded it, and when (from the journal). '' when not known (a load of an older version). */
  verifier: string;
  loadedAt: string;
  cis: number;
  relationshipReport: string;
  /** The report compared with, or '' when there is none in the active memory. */
  previous: string;
  checks: CheckRecord[];
  /** Notes of the load that belong to no single check (routing, listing, hidden characters). */
  general: string[];
  totals: { toSolve: number; other: number; newSince: number; verifiedSince: number };
}

/**
 * The verification record of one load: date, verifier, and per check what was tested, what was found, what is new and
 * what was verified since the previous report, and what could not be tested and why.
 */
export function verificationRecord(run: Run, previous: Run | null, packs: CheckPack[], verifier: { name: string; at: string } | null): VerificationRecord {
  const before = new Set((previous?.facts ?? []).map((fact) => fact.key));
  const now = new Set(run.facts.map((fact) => fact.key));
  // A parked CI (D179) is not checked: its finding of the report before is not verified.
  const cis = checkedIn(run);
  const tested = new Set(run.tested);
  const general: string[] = (run.parked?.lines ?? []).map((line) => `${line}.`);
  const notesByCheck = new Map<string, string[]>();
  const ids = new Set(packs.map((pack) => pack.id));
  for (const note of run.notes) {
    const found = /^([A-Z0-9-]+): (.*)$/.exec(note);
    if (found && ids.has(found[1]!)) notesByCheck.set(found[1]!, (notesByCheck.get(found[1]!) ?? []).concat([found[2]!]));
    else general.push(note);
  }
  const checks = recordedChecks(packs).map((pack): CheckRecord => {
    const fields = Object.keys(run.evaluated ?? {}).filter((key) => key.startsWith(`${pack.id}:`));
    const testedCis = fields.reduce((most, key) => Math.max(most, run.evaluated![key]!), 0);
    const own = run.facts.filter((fact) => fact.checkId === pack.id);
    const open = own.filter((fact) => stateOf(fact) === 'open');
    const gone = (previous?.facts ?? []).filter((fact) => fact.checkId === pack.id && !now.has(fact.key)
      && tested.has(`${fact.checkId}:${fact.field}`) && (!cis || cis.has(fact)));
    const notes = notesByCheck.get(pack.id) ?? [];
    const wasTested = fields.length > 0 || run.tested.some((key) => key.startsWith(`${pack.id}:`));
    return {
      checkId: pack.id, label: pack.cardLabel ?? pack.title, module: pack.dimension,
      tested: testedCis, unit: pack.subject === 'contract' ? 'contract' : RELATIONSHIP_DETECTORS.indexOf(pack.detector.module ?? '') >= 0 ? 'relationship' : 'CI',
      wasTested, toSolve: open.length, toSolveCis: new Set(open.map((fact) => fact.ciKey)).size, other: own.length - open.length,
      newSince: previous ? open.filter((fact) => !before.has(fact.key)).length : 0,
      verifiedSince: gone.length,
      notTested: wasTested ? notes : notes.length ? notes : ['Not tested by this report (no reason was recorded).']
    };
  });
  return {
    date: run.date, report: run.report, verifier: verifier?.name ?? '', loadedAt: verifier?.at ?? '', cis: run.cis,
    relationshipReport: run.relationshipReport ?? '', previous: previous ? `${previous.report} (report of ${previous.date})` : '',
    checks, general,
    totals: {
      toSolve: checks.reduce((sum, check) => sum + check.toSolve, 0), other: checks.reduce((sum, check) => sum + check.other, 0),
      newSince: checks.reduce((sum, check) => sum + check.newSince, 0), verifiedSince: checks.reduce((sum, check) => sum + check.verifiedSince, 0)
    }
  };
}

export const VERIFICATION_COLUMNS = ['Report date', 'Report', 'Verifier', 'Loaded at', 'Module', 'Check', 'Tested', 'To solve', 'CIs to solve', 'Other findings (waiting, known, to review)', 'New since the last report', 'Verified since the last report', 'Not tested, and why'] as const;

export function verificationCsv(record: VerificationRecord): string {
  return csvText(VERIFICATION_COLUMNS, record.checks.map((check) => [
    record.date, record.report, record.verifier || 'not known', record.loadedAt.replace('T', ' ').slice(0, 16), check.module, check.label,
    testedText(check), check.toSolve, check.toSolveCis, check.other, check.newSince, check.verifiedSince, check.notTested.join(' | ')
  ]));
}

/* ------------------------------------------------------------------ history across every load (the archive too) */

/** What the audit needs of a run: small, so many runs can be read one after the other. */
export interface SlimRun {
  date: string;
  report: string;
  cis: number;
  facts: Array<Pick<Fact, 'key' | 'checkId' | 'ciKey' | 'ciName' | 'classLabel' | 'field' | 'detail' | 'state' | 'contactName' | 'contactEmail'>>;
  tested: string[];
  ciKeys?: string[];
  parked?: Run['parked'];
}

export const slimRun = (run: Run): SlimRun => ({
  date: run.date, report: run.report, cis: run.cis, tested: run.tested, ...(run.ciKeys ? { ciKeys: run.ciKeys } : {}), ...(run.parked ? { parked: run.parked } : {}),
  facts: run.facts.map((fact) => ({
    key: fact.key, checkId: fact.checkId, ciKey: fact.ciKey, ciName: fact.ciName, classLabel: fact.classLabel, field: fact.field,
    detail: fact.detail, ...(fact.state ? { state: fact.state } : {}), contactName: fact.contactName, contactEmail: fact.contactEmail
  }))
});

/** One life of a finding: from the first report that showed it to the report that no longer did ('' while it lasts). */
export interface Episode { key: string; fact: SlimRun['facts'][number]; firstSeen: string; lastSeen: string; verifiedOn: string }

/**
 * Every finding's lives, from the runs in date order. A finding ends (is verified) on the first later report that
 * contains the CI, could test the check, and no longer shows it; if it comes back, a new life starts.
 */
export function episodes(runs: SlimRun[]): Episode[] {
  const ordered = runs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  const open = new Map<string, Episode>();
  const done: Episode[] = [];
  for (const run of ordered) {
    const shown = new Set<string>();
    for (const fact of run.facts) {
      shown.add(fact.key);
      const current = open.get(fact.key);
      if (current) { current.fact = fact; current.lastSeen = run.date; }
      else open.set(fact.key, { key: fact.key, fact, firstSeen: run.date, lastSeen: run.date, verifiedOn: '' });
    }
    const tested = new Set(run.tested);
    const cis = checkedIn(run);
    open.forEach((episode, key) => {
      if (shown.has(key) || !tested.has(`${episode.fact.checkId}:${episode.fact.field}`) || (cis && !cis.has(episode.fact))) return;
      episode.verifiedOn = run.date;
      done.push(episode);
      open.delete(key);
    });
  }
  return done.concat(Array.from(open.values()));
}

/* ------------------------------------------------------------------ the audit export of a period */

export interface AuditAction { at: string; by: string; action: string; detail: string; cis: number; ref: string }
export interface AuditVerified { ciName: string; classLabel: string; check: string; detail: string; firstSeen: string; verifiedOn: string; days: number }
export interface AuditOpen { ciName: string; classLabel: string; check: string; detail: string; firstSeen: string; ageDays: number; contact: string; state: string; exception: boolean }

export interface AuditSummary {
  period: Period;
  /** The CI reports loaded in the period, with who loaded them. */
  loads: Array<{ date: string; report: string; verifier: string; toSolve: number }>;
  /** Per check: findings to solve shown in the period, and how many of them were new in the period. */
  found: Array<{ check: string; findings: number; cis: number; newInPeriod: number }>;
  actions: AuditAction[];
  /** Counts of the actions by kind ("Email", "Reminder", "Teams chat"…). */
  actionCounts: Array<{ action: string; count: number }>;
  verified: AuditVerified[];
  /** Still open at the end of the period (in the last report of the period), with their age. */
  open: AuditOpen[];
  exceptions: ExceptionLine[];
  /** Days a verified case took: average and longest. */
  days: { average: number; longest: number };
  /** What the export could not cover. Never silent. */
  notes: string[];
}

/** The results of the lifecycle review in words (the ids of reference/lifecycle). */
export const REVIEW_WORDS: Record<string, string> = { same: 'same in EPO', different: 'not the same as in EPO', 'not-in-epo': 'not in EPO' };

/** An event in words, for the audit (who did what). '' for the events the audit does not list. */
function actionOf(event: CaseEvent): { action: string; detail: string } | null {
  switch (event.type) {
    case 'message':
      if (event.channel === 'teams') return { action: 'Teams chat', detail: `With ${event.to ?? ''}${event.subject ? `: ${event.subject}` : ''}` };
      return { action: event.kind === 'reminder' ? 'Reminder' : event.kind === 'escalation' ? 'Escalation' : 'Email', detail: `To ${event.to ?? ''}${event.cc ? `, Cc ${event.cc}` : ''}${event.subject ? `: ${event.subject}` : ''}` };
    case 'request': return event.text ? { action: 'Request', detail: `Request number ${event.text}` } : null;
    case 'status': return { action: event.text === 'Waived' ? 'Not followed up' : 'Status', detail: `Set to ${event.text ?? ''}` };
    case 'exception': return { action: event.text === 'Ended by hand' ? 'Followed up again' : 'Not followed up', detail: `${event.reason ?? ''}${event.text ? `: ${event.text}` : ''}; review on ${event.reviewOn || 'none'}${event.ciName ? `; ${event.ciName}` : ''}` };
    case 'assign': return { action: 'Assigned', detail: event.text ? `To ${event.text}` : 'Assignment removed' };
    case 'handover': return { action: 'Handover', detail: `To ${event.to ?? ''}${event.text ? `: ${event.text}` : ''}` };
    case 'report': return { action: /^Removed the load/.test(event.text ?? '') ? 'Load removed' : 'Report loaded', detail: event.text ?? '' };
    case 'settings': return { action: 'Settings changed', detail: event.text ?? '' };
    case 'review': return event.ciKey
      ? { action: 'Lifecycle review', detail: `${event.ciName ?? event.ciKey}: ${REVIEW_WORDS[event.reason ?? ''] ?? event.reason ?? ''}${event.text ? `. ${event.text}` : ''}` }
      : { action: 'Lifecycle review', detail: event.text ?? '' };
    case 'retirement': return { action: 'Planned retirement date', detail: `${event.retireOn ? `Set to ${event.retireOn}` : 'Taken away'}${event.text ? `: ${event.text}` : ''}` };
    case 'reviewed': return { action: 'Reviewed by SACM', detail: event.text === REVIEWED_ASK ? 'SACM checked it: the owner is asked' : 'Back to SACM' };
    case 'stage': return { action: 'Mapping stage', detail: `Set to ${event.text ?? ''}` };
    case 'no-process': return { action: 'Process does not exist', detail: event.text === 'yes' ? 'The owner says the Business Process does not exist' : 'Mark taken away' };
    case 'note': return { action: 'Note', detail: event.text ?? '' };
    case 'person-note': return { action: 'Note about a person', detail: event.text ?? '' };
    default: return null;
  }
}

export interface AuditInput {
  period: Period;
  /** Every CI run that could be read, active and archived, slim. */
  runs: SlimRun[];
  /** The whole journal (every month). */
  events: CaseEvent[];
  replies: Reply[];
  packs: CheckPack[];
  today: string;
  /** Notes from reading the folder (files that could not be read). */
  notes?: string[];
}

/** The audit export of a period: findings found, actions taken, cases verified with their days, cases still open with their age, exceptions. */
export function auditSummary(input: AuditInput): AuditSummary {
  const { period } = input;
  const label = new Map(input.packs.map((pack) => [pack.id, pack.cardLabel ?? pack.title]));
  const labelOf = (id: string): string => (id === '*' ? 'Every check' : label.get(id) ?? id);
  const runs = input.runs.filter((run) => run.date <= period.to).sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  const inside = runs.filter((run) => run.date >= period.from);
  const notes = (input.notes ?? []).slice();
  if (!inside.length) notes.push(`No CI report of ${period.from} to ${period.to} was found in the folder (active or archived).`);

  const events = uniqueEvents(input.events);
  const loads = inside.map((run) => {
    const loaded = events.filter((event) => event.type === 'report' && /^Loaded/.test(event.text ?? '') && event.ref === runFileName(run.date, run.report))
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    return { date: run.date, report: run.report, verifier: loaded ? loaded.byName || loaded.by : 'not known', toSolve: run.facts.filter((fact) => stateOf(fact as Fact) === 'open').length };
  });

  const lives = episodes(runs);
  const byCheck = new Map<string, { findings: Set<string>; cis: Set<string>; fresh: Set<string> }>();
  for (const run of inside) {
    for (const fact of run.facts) {
      if (stateOf(fact as Fact) !== 'open') continue;
      const entry = byCheck.get(fact.checkId) ?? { findings: new Set<string>(), cis: new Set<string>(), fresh: new Set<string>() };
      entry.findings.add(fact.key);
      entry.cis.add(fact.ciKey);
      byCheck.set(fact.checkId, entry);
    }
  }
  for (const life of lives) {
    const entry = byCheck.get(life.fact.checkId);
    if (entry && entry.findings.has(life.key) && life.firstSeen >= period.from && life.firstSeen <= period.to) entry.fresh.add(life.key);
  }
  const found = input.packs.filter((pack) => byCheck.has(pack.id)).map((pack) => {
    const entry = byCheck.get(pack.id)!;
    return { check: labelOf(pack.id), findings: entry.findings.size, cis: entry.cis.size, newInPeriod: entry.fresh.size };
  });

  const actions: AuditAction[] = [];
  for (const event of events) {
    if (!inPeriod(event.at, period)) continue;
    const described = actionOf(event);
    if (!described) continue;
    actions.push({ at: event.at, by: event.byName || event.by, ...described, cis: new Set(event.keys.map((key) => key.split(':')[1] ?? key)).size || (event.ciKey ? 1 : 0), ref: event.ref ?? '' });
  }
  actions.sort((a, b) => a.at.localeCompare(b.at) || a.action.localeCompare(b.action));
  const counts = new Map<string, number>();
  for (const action of actions) counts.set(action.action, (counts.get(action.action) ?? 0) + 1);
  const replies = input.replies.filter((reply) => inPeriod(reply.received, period)).length;
  if (replies) counts.set('Reply received', replies);

  // Which keys had an exception in force at the end of the period.
  const factOf = new Map(lives.map((life) => [life.key, life.fact] as const));
  const exceptionsAll = exceptionLines(events.filter((event) => event.at.slice(0, 10) <= period.to), factOf, period.to);
  const covered = (key: string, checkId: string, ciKey: string): boolean => exceptionsAll.some((line) => line.state === 'running'
    && (line.standing ? standingCovers(line.event, checkId, ciKey) : line.target === key));

  // A finding listed for a review first is to solve once SACM asked the owner (a 'reviewed' event on its key); a finding with a
  // planned retirement date after the end of the period waits (a 'retirement' event).
  const reviewed = new Map<string, CaseEvent[]>();
  for (const event of events.slice().sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    if (event.type === 'reviewed' || (event.type === 'retirement' && event.at.slice(0, 10) <= period.to)) for (const key of event.keys) reviewed.set(key, (reviewed.get(key) ?? []).concat([event]));
  }
  const stateIn = (life: { key: string; fact: unknown }) => caseState(life.fact as Fact, reviewed.get(life.key) ?? [], period.to);
  const verified: AuditVerified[] = lives.filter((life) => life.verifiedOn && inPeriod(life.verifiedOn, period) && stateIn(life) === 'open').map((life) => ({
    ciName: life.fact.ciName, classLabel: life.fact.classLabel, check: labelOf(life.fact.checkId), detail: life.fact.detail,
    firstSeen: life.firstSeen, verifiedOn: life.verifiedOn, days: daysBetween(life.firstSeen, life.verifiedOn)
  })).sort((a, b) => a.verifiedOn.localeCompare(b.verifiedOn) || a.ciName.localeCompare(b.ciName));
  const last = runs[runs.length - 1];
  const open: AuditOpen[] = !last ? [] : lives.filter((life) => !life.verifiedOn && life.lastSeen === last.date).map((life) => ({
    ciName: life.fact.ciName, classLabel: life.fact.classLabel, check: labelOf(life.fact.checkId), detail: life.fact.detail,
    firstSeen: life.firstSeen, ageDays: daysBetween(life.firstSeen, period.to < input.today ? period.to : input.today),
    contact: life.fact.contactName || life.fact.contactEmail, state: stateIn(life), exception: covered(life.key, life.fact.checkId, life.fact.ciKey)
  })).sort((a, b) => b.ageDays - a.ageDays || a.ciName.localeCompare(b.ciName));
  const exceptions = exceptionsAll.filter((line) => inPeriod(line.at, period) || line.state === 'running');
  const total = verified.reduce((sum, item) => sum + item.days, 0);
  return {
    period, loads, found, actions,
    actionCounts: Array.from(counts.entries()).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count || a.action.localeCompare(b.action)),
    verified, open, exceptions,
    days: { average: verified.length ? Math.round(total / verified.length) : 0, longest: verified.reduce((most, item) => Math.max(most, item.days), 0) },
    notes
  };
}

function uniqueEvents(events: CaseEvent[]): CaseEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => { if (seen.has(event.id)) return false; seen.add(event.id); return true; });
}

export const AUDIT_FILES = {
  actions: { header: ['Date and time', 'By', 'Action', 'Detail', 'CIs', 'Reference'] as const },
  verified: { header: ['CI', 'Class', 'Check', 'What we found', 'First seen', 'Verified on', 'Days'] as const },
  open: { header: ['CI', 'Class', 'Check', 'What we found', 'First seen', 'Age in days', 'Person asked', 'Listed as', 'Not followed up'] as const },
  found: { header: ['Check', 'Findings to solve', 'CIs', 'New in the period'] as const },
  loads: { header: ['Report date', 'Report', 'Verifier', 'Findings to solve'] as const }
};

/** The CSV files of the audit export, by name. */
export function auditCsvFiles(summary: AuditSummary, label: (checkId: string) => string): Record<string, string> {
  const STATE: Record<string, string> = { open: 'To solve', review: 'To review', waiting: 'Waiting', known: 'Known' };
  return {
    'loads.csv': csvText(AUDIT_FILES.loads.header, summary.loads.map((load) => [load.date, load.report, load.verifier, load.toSolve])),
    'findings.csv': csvText(AUDIT_FILES.found.header, summary.found.map((row) => [row.check, row.findings, row.cis, row.newInPeriod])),
    'actions.csv': csvText(AUDIT_FILES.actions.header, summary.actions.map((row) => [row.at.replace('T', ' ').slice(0, 16), row.by, row.action, row.detail, row.cis, row.ref])),
    'verified.csv': csvText(AUDIT_FILES.verified.header, summary.verified.map((row) => [row.ciName, row.classLabel, row.check, row.detail, row.firstSeen, row.verifiedOn, row.days])),
    'open.csv': csvText(AUDIT_FILES.open.header, summary.open.map((row) => [row.ciName, row.classLabel, row.check, row.detail, row.firstSeen, row.ageDays, row.contact, STATE[row.state] ?? row.state, row.exception ? 'yes' : ''])),
    'not-followed-up.csv': exceptionsCsv(summary.exceptions, label)
  };
}

/* ------------------------------------------------------------------ settings changes */

/**
 * What changed between two versions of the team settings, in words, one line per field: "Working days before a reminder:
 * 3 → 5". `labels` names the fields; nested objects (the request links) are compared field by field. Fields without a
 * label are named by their key.
 */
/** One item of a list of the settings in words: a person is "Name (email)". */
function listItem(item: unknown): string {
  if (!item || typeof item !== 'object') return String(item ?? '');
  const { name, email } = item as { name?: unknown; email?: unknown };
  return name && email ? `${String(name)} (${String(email)})` : Object.values(item).map(String).filter(Boolean).join(' ');
}

export function settingsChanges(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string> = {}): string[] {
  const flat = (value: Record<string, unknown>, prefix = ''): Map<string, string> => {
    const out = new Map<string, string>();
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item)) flat(item as Record<string, unknown>, `${prefix}${key}.`).forEach((text, sub) => out.set(sub, text));
      // A list (the people of a team): "Name (email), Name (email)".
      else if (Array.isArray(item)) out.set(`${prefix}${key}`, item.map(listItem).join(', '));
      else out.set(`${prefix}${key}`, item === undefined || item === null ? '' : String(item));
    }
    return out;
  };
  const a = flat(before);
  const b = flat(after);
  const keys = Array.from(new Set(Array.from(a.keys()).concat(Array.from(b.keys())))).sort();
  const lines: string[] = [];
  for (const key of keys) {
    const old = a.get(key) ?? '';
    const now = b.get(key) ?? '';
    if (old === now) continue;
    lines.push(`${labels[key] ?? key}: ${old || '(empty)'} → ${now || '(empty)'}`);
  }
  return lines;
}

/** What changed in the team list: "Added Nia (nia@…)", "Removed …", "Renamed …". */
export function teamChanges(before: Array<{ name: string; email: string }>, after: Array<{ name: string; email: string }>): string[] {
  const key = (email: string): string => email.trim().toLowerCase();
  const old = new Map(before.map((member) => [key(member.email), member]));
  const now = new Map(after.map((member) => [key(member.email), member]));
  const lines: string[] = [];
  now.forEach((member, email) => {
    const was = old.get(email);
    if (!was) lines.push(`Added ${member.name} (${member.email}) to the team list`);
    else if (was.name !== member.name) lines.push(`Renamed ${was.name} to ${member.name} in the team list`);
  });
  old.forEach((member, email) => { if (!now.has(email)) lines.push(`Removed ${member.name} (${member.email}) from the team list`); });
  return lines;
}
