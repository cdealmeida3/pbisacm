import { buildCases, exceptionRuns, isClosedStatus } from '../cases/cases.ts';
import type { Case, CaseEvent, Fact, Past, Reply, Rules, Run } from '../cases/cases.ts';
import { reportType } from '../sources/report-types.ts';

/**
 * Keeps the shared memory small as it grows. Pure: the app reads and moves the files, this decides what goes where.
 *
 * The app reads only the active part of the workspace folder:
 *   data/runs/                     the last ACTIVE_RUNS runs
 *   data/state.json                what older runs, journals and replies still mean for the cases (a summary, see MemoryState)
 *   data/journal/yyyy-mm/          journal months from `journalFrom` on
 *   replies/                       replies not handled yet
 * The rest is kept, never deleted, for the audit trail:
 *   data/archive/yyyy-mm/          older runs
 *   data/journal/yyyy-mm/          older journal months (their events that still matter are copied into state.json)
 *   replies/archive/yyyy-mm/       handled replies
 *
 * state.json is a summary that can always be rebuilt from the files above, so a lost or clashing copy does no harm.
 */

export const ACTIVE_RUNS = 10;
export const STATE_VERSION = 1;

export interface MemoryState<P = unknown> extends Past {
  version: number;
  /**
   * Files written before version 0.11 also hold `written` and `writtenBy`. They are no longer written: two computers that
   * rebuild the summary at the same time must write the same bytes, or OneDrive keeps a conflict copy.
   */
  written?: string;
  writtenBy?: string;
  /** File names of the runs in data/archive/, so the app can tell when the archive and the summary disagree. */
  archivedRuns: string[];
  /** yyyy-mm. Journal months before this one are not read; their events that still matter are in `events`. */
  journalFrom: string;
  events: CaseEvent[];
  replies: Reply[];
  /** The roles of the CIs in `facts`, as the last archived run that had them showed. */
  people: Record<string, P>;
}

/** A run as the app keeps it in memory: the run and its file name. */
export interface NamedRun<R extends Run = Run> { file: string; run: R }

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

/** The journal file of one person for one month. */
export const journalPath = (month: string, person: string): string => `data/journal/${month}/${person}.jsonl`;

/** The runs to keep active (the newest `keep`) and the runs to archive. File names start with the date, so they sort by date. */
export function splitRuns(files: string[], keep = ACTIVE_RUNS): { active: string[]; archive: string[] } {
  const sorted = files.slice().sort();
  const cut = Math.max(0, sorted.length - keep);
  return { active: sorted.slice(cut), archive: sorted.slice(0, cut) };
}

/** The archive folder of a run file (`2026-11-12_x.json` → `data/archive/2026-11`). Other report kinds get a subfolder. */
export const archiveFolderOf = (runFile: string, kind = 'ci'): string =>
  kind === 'ci' ? `data/archive/${monthOf(runFile)}` : `data/archive/${monthOf(runFile)}/${folderOf(kind)}`;

/**
 * Where the loads of each kind of report are kept: the `folder` of its report type (src/core/sources/report-types.ts).
 * CI runs stay directly in data/runs/ (as in version 0.6), other kinds in a subfolder, so an older version of the app,
 * which reads only the files of data/runs/, never mistakes them for CI runs.
 */
const folderOf = (kind: string): string => reportType(kind)?.folder ?? kind;
export const runFolder = (kind = 'ci'): string => (kind === 'ci' ? 'data/runs' : `data/runs/${folderOf(kind)}`);

/** A wrong load that a manager removed: kept here, never deleted (`data/archive/2026-11/removed`). */
export const removedFolderOf = (runFile: string): string => `data/archive/${monthOf(runFile)}/removed`;

/**
 * Why state.json cannot be trusted and must be rebuilt, or '' when it can.
 * `archived` lists the run files in data/archive/, `active` those in data/runs/, `otherStates` any other state*.json in data/
 * (OneDrive saves a conflict copy like `state-PC01.json` when two people write at the same time).
 */
export function rebuildReason(state: MemoryState | null, archived: string[], active: string[], otherStates: string[]): string {
  if (!state) return archived.length ? 'data/state.json is missing' : '';
  if (state.version !== STATE_VERSION) return 'data/state.json has another version';
  if (otherStates.length) return `a conflict copy exists (${otherStates.join(', ')})`;
  const known = new Set(state.archivedRuns);
  if (archived.length !== known.size || archived.some((file) => !known.has(file))) return 'the archive and data/state.json do not match';
  if (active.some((file) => known.has(file))) return 'a run is both active and archived';
  return '';
}

export interface CompactInput<P> {
  /** The current summary, or null to build it from nothing. */
  prior: MemoryState<P> | null;
  /** Runs to fold into the summary (the runs being archived now, or the whole archive when rebuilding). */
  foldRuns: (Run & { people?: Record<string, P> })[];
  /** Events of journal months before `journalFrom`. */
  foldEvents: CaseEvent[];
  /** Replies moved, or being moved, to replies/archive/. */
  foldReplies: Reply[];
  /** The runs that stay active, the events of journal months from `journalFrom` on, and the replies still in replies/. */
  active: Run[];
  recentEvents: CaseEvent[];
  openReplies: Reply[];
  archivedRuns: string[];
  journalFrom: string;
  today: string;
  rules: Rules;
}

const closed = (item: Case): boolean => isClosedStatus(item.status);

function uniqueBy<T>(items: T[], id: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => { const key = id(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

/**
 * The new summary. A finding is kept when a still active run shows it, or when its case is still open
 * (for example a CI missing from partial reports). A case that is closed and no longer in any active run is dropped
 * from the summary; its history stays in the archive files.
 */
export function compact<P>(input: CompactInput<P>): MemoryState<P> {
  const firstSeen: Record<string, string> = { ...(input.prior?.firstSeen ?? {}) };
  const facts: Record<string, Fact> = { ...(input.prior?.facts ?? {}) };
  const people: Record<string, P> = { ...(input.prior?.people ?? {}) };
  const ordered = input.foldRuns.slice().sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  for (const run of ordered) {
    for (const fact of run.facts) {
      if (!firstSeen[fact.key] || run.date < firstSeen[fact.key]!) firstSeen[fact.key] = run.date;
      facts[fact.key] = fact;
    }
    for (const ci of Object.keys(run.people ?? {})) people[ci] = run.people![ci]!;
  }
  const oldEvents = uniqueBy((input.prior?.events ?? []).concat(input.foldEvents), (event) => event.id);
  const oldReplies = uniqueBy((input.prior?.replies ?? []).concat(input.foldReplies), (reply) => reply.file);
  const recentIds = new Set(input.recentEvents.map((event) => event.id));

  const cases = buildCases(input.active, oldEvents.filter((event) => !recentIds.has(event.id)).concat(input.recentEvents),
    oldReplies.concat(input.openReplies), input.today, input.rules, { firstSeen, facts });
  const activeKeys = new Set<string>();
  for (const run of input.active) for (const fact of run.facts) activeKeys.add(fact.key);
  const keep = new Set(activeKeys);
  for (const item of cases) if (!closed(item)) keep.add(item.key);

  const state: MemoryState<P> = {
    version: STATE_VERSION,
    archivedRuns: input.archivedRuns.slice().sort(), journalFrom: input.journalFrom,
    firstSeen: {}, facts: {}, events: [], replies: [], people: {}
  };
  for (const key of Object.keys(firstSeen)) if (keep.has(key)) state.firstSeen[key] = firstSeen[key]!;
  // The facts of active findings are in the active runs; the summary only needs the others.
  for (const key of Object.keys(facts)) {
    if (!keep.has(key) || activeKeys.has(key)) continue;
    state.facts[key] = facts[key]!;
    const ci = facts[key]!.ciKey;
    if (people[ci] !== undefined) state.people[ci] = people[ci]!;
  }
  const refs = new Set<string>();
  for (const event of oldEvents) {
    if (monthOf(event.at) >= input.journalFrom) continue;
    // An exception for a CI not raised yet has no keys, and a running exception must still apply if its finding comes
    // back: both are kept whole.
    if (event.type === 'exception' && (!event.keys.length || exceptionRuns(event, input.today))) { state.events.push(event); continue; }
    const keys = event.keys.filter((key) => keep.has(key));
    if (!keys.length) continue;
    state.events.push({ ...event, keys });
    if (event.ref) refs.add(event.ref);
  }
  for (const event of input.recentEvents) if (event.ref && event.keys.some((key) => keep.has(key))) refs.add(event.ref);
  state.replies = oldReplies.filter((reply) => refs.has(reply.ref));
  return state;
}

/**
 * The replies that can move to replies/archive/: every case they belong to is closed, or no case has their reference
 * and they arrived before `journalFrom`.
 */
export function handledReplies(replies: Reply[], cases: Case[], journalFrom: string): Reply[] {
  const byRef = new Map<string, Case[]>();
  for (const item of cases) {
    for (const message of item.messages) {
      if (message.ref) byRef.set(message.ref, (byRef.get(message.ref) ?? []).concat([item]));
    }
  }
  return replies.filter((reply) => {
    const owners = byRef.get(reply.ref);
    if (!owners) return !!reply.received && monthOf(reply.received) < journalFrom;
    return owners.every(closed);
  });
}

/** The archive folder of a reply, by the month it arrived (`replies/archive/2026-11`). */
export const replyArchiveOf = (reply: Reply, fallbackMonth: string): string =>
  `replies/archive/${/^\d{4}-\d{2}/.test(reply.received) ? monthOf(reply.received) : fallbackMonth}`;

/** Splits one old journal (all months in one file) into months. */
export function eventsByMonth(events: CaseEvent[]): Map<string, CaseEvent[]> {
  const months = new Map<string, CaseEvent[]>();
  for (const event of events) {
    const month = monthOf(event.at);
    months.set(month, (months.get(month) ?? []).concat([event]));
  }
  return months;
}

export const parseJournal = (text: string): CaseEvent[] => text.split('\n').map((line) => {
  try { return JSON.parse(line) as CaseEvent; } catch { return null; }
}).filter((event): event is CaseEvent => !!event && typeof event.at === 'string' && Array.isArray(event.keys));

export const writeJournal = (events: CaseEvent[]): string =>
  uniqueBy(events, (event) => event.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).map((event) => JSON.stringify(event)).join('\n');
