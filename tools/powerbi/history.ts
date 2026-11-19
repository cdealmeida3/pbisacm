// The answer key of the history and of the team's state in the Power BI report (build B5, D290 to D293): what the
// TypeScript logic of src/core/ gives on the invented samples of the Power BI project, so tools/powerbi/parity.ts can
// compare the Power Query result with it.
//   - The runs of every CI report date of the samples: the earlier CI report of powerbi/samples/ (4 November) and the
//     newest of samples/ (11 November, tests/recorded/run.json), each with the other reports dated on or before it.
//   - The team's state as SharePoint lists hold it (powerbi/samples/state/*.csv): the journal, the replies, the settings,
//     the team and the lifecycle reviews, read as the app reads its journal and replies (DATA-MODEL §3).
//   - The cases (buildCases), the verification record of the newest report against the one before
//     (verificationRecord) and the lives of every finding (episodes).
// Only invented data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { readTable } from '../../src/core/reading/table.ts';
import type { Table } from '../../src/core/reading/table.ts';
import { parseCsv } from '../../src/core/reading/csv.ts';
import { buildCases, buildRun, checkedIn, isClosedStatus, isDaily, stateOf } from '../../src/core/cases/cases.ts';
import type { Case, CaseEvent, EventType, Reply, Rules, Run } from '../../src/core/cases/cases.ts';
import { runChecks } from '../../src/core/checks/engine.ts';
import { withTeamDays } from '../../src/core/checks/detectors/ci-detectors.ts';
import { contractConfig, readSolusiFile } from '../../src/core/sources/contracts/contract-reports.ts';
import { hiddenNames, readRelationshipReport } from '../../src/core/sources/relationships/relationship-report.ts';
import { hiddenNotes, readCiReport } from '../../src/core/sources/ci/ci-report.ts';
import { daysBetween, episodes, exceptionLines, exceptionStateWord, slimRun, verificationRecord } from '../../src/core/audit/audit.ts';
import { addBusinessDays } from '../../src/core/shared/dates.ts';
import { repliesToRead, statusWord } from '../../src/app/view/cases.ts';
import { cardWords, describeEvent } from '../../src/app/view/activity.ts';
import type { Episode, VerificationRecord } from '../../src/core/audit/audit.ts';
import { loadPacks, loadReferences } from '../../src/hosts/cli.ts';
import { DEFAULT_SETTINGS, NUMBER_RANGES, settingNumber } from '../../src/app/state/store.ts';
import { rowsInEmailOf } from './email.ts';
import type { NumberSetting } from '../../src/app/state/store.ts';
import { EARLIER, RECORD_DATE, SAMPLE_FILES } from '../../tests/sample-record.ts';
import { caseActions, personOf } from './actions.ts';
import { sampleMembers, shareOutOf } from './messages.ts';
import { mappingConfig } from '../../src/core/mapping/backlog.ts';
import { withSampleReviews } from './review.ts';

const root = join(import.meta.dirname, '..', '..');
const utf8 = new TextDecoder('utf-8');
const table = (path: string): Promise<Table> =>
  readTable(new Uint8Array(readFileSync(path)), async (data) => new Uint8Array(inflateRawSync(data)), (data) => utf8.decode(data));

/** The date of the earlier CI report of the Power BI samples: the date of the earlier Solusi contract file. */
export const HISTORY_DATE = EARLIER;

/** The report files that only the Power BI project has (powerbi/samples/), with the date they carry in the folder. */
export const HISTORY_FILES = [
  { path: join(root, 'powerbi', 'samples', 'cmdb_ci-sample-earlier.csv'), name: 'cmdb_ci-sample-earlier.csv', date: HISTORY_DATE, kind: 'ci' },
  { path: join(root, 'powerbi', 'samples', 'cmdb_rel_ci-sample-earlier.csv'), name: 'cmdb_rel_ci-sample-earlier.csv', date: HISTORY_DATE, kind: 'relationship' }
] as const;

/* ------------------------------------------------------------------ the SharePoint lists (D291) */

/**
 * The four lists of the team's state (the lifecycle reviews are journal rows since build B8, D306), with their columns (internal names) in the order of the sample files. The sample
 * files of powerbi/samples/state/ have exactly these columns; Power Query reads the lists in SharePoint with the same
 * names (powerbi/README.md says how to make them).
 */
export const STATE_LISTS = {
  journal: { list: 'SACM Journal', file: 'journal.csv', columns: ['Title', 'At', 'By', 'ByName', 'Type', 'Keys', 'Text', 'Ref', 'To', 'Cc', 'Subject', 'Kind', 'Channel', 'Person', 'Reason', 'ReviewOn', 'RetireOn', 'CheckId', 'CiKey', 'CiName', 'Items'] },
  replies: { list: 'SACM Replies', file: 'replies.csv', columns: ['Title', 'From', 'Received', 'Subject', 'Body'] },
  settings: { list: 'SACM Settings', file: 'settings.csv', columns: ['Title', 'Value'] },
  team: { list: 'SACM Team', file: 'team.csv', columns: ['Title', 'Email', 'Active'] }
} as const;
export type StateList = keyof typeof STATE_LISTS;

/** The rows of a sample list as records of text (an empty cell is ''). */
export function stateRows(list: StateList): Array<Record<string, string>> {
  const rows = parseCsv(readFileSync(join(root, 'powerbi', 'samples', 'state', STATE_LISTS[list].file), 'utf8'));
  const header = rows[0] ?? [];
  return rows.slice(1).filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => Object.fromEntries(header.map((name, at) => [name, String(row[at] ?? '')])));
}

/** The keys of a journal row: one per line of the column Keys (a multi-line text column), without empty lines. */
export const keysOf = (text: string): string[] => text.split(/\r?\n/).map((key) => key.trim()).filter(Boolean);

/** A row of the list SACM Journal as the event of the app's journal (DATA-MODEL §3). Empty columns are left out. */
export function journalEvent(row: Record<string, string>): CaseEvent {
  const event: CaseEvent = { id: row.Title ?? '', at: row.At ?? '', by: (row.By ?? '').toLowerCase(), byName: row.ByName ?? '', type: (row.Type ?? '') as EventType, keys: keysOf(row.Keys ?? '') };
  const optional: Array<[keyof CaseEvent, string]> = [['text', 'Text'], ['ref', 'Ref'], ['to', 'To'], ['cc', 'Cc'], ['subject', 'Subject'], ['kind', 'Kind'], ['channel', 'Channel'],
    ['person', 'Person'], ['reason', 'Reason'], ['reviewOn', 'ReviewOn'], ['checkId', 'CheckId'], ['ciKey', 'CiKey'], ['ciName', 'CiName']];
  for (const [field, column] of optional) if (row[column]) (event as unknown as Record<string, string>)[field] = row[column]!;
  // A retirement event always has its date: '' takes a planned date away.
  if (event.type === 'retirement') event.retireOn = row.RetireOn ?? '';
  return event;
}

/** A row of the list SACM Replies as a reply of the app (its file: the reference and the time it arrived). */
export const replyOf = (row: Record<string, string>): Reply =>
  ({ ref: row.Title ?? '', from: row.From ?? '', received: row.Received ?? '', subject: row.Subject ?? '', text: row.Body ?? '', file: `${row.Title ?? ''}|${row.Received ?? ''}` });

/** The rules of the cases from the list SACM Settings: a number outside its range (D158) is not used, the default is. */
export function rulesOf(rows: Array<Record<string, string>>): Rules {
  const numbers = teamNumbers(rows);
  return { reminderDays: numbers.reminderDays, maxReminders: numbers.maxReminders };
}

/**
 * The six numbers of the team settings (CaseRules): the last row of each key counts, as the Settings screen of the Power
 * App adds a row for each change (build B8, D308); a value outside its range (D158) is not used, the default is.
 */
export function teamNumbers(rows: Array<Record<string, string>>): Record<NumberSetting, number> {
  const out = {} as Record<NumberSetting, number>;
  for (const key of Object.keys(NUMBER_RANGES) as NumberSetting[]) {
    const last = rows.filter((row) => (row.Title ?? '').trim() === key).pop();
    out[key] = settingNumber(key, last?.Value ?? '') ?? DEFAULT_SETTINGS[key];
  }
  return out;
}

/** The rows of the table Settings: one per key, the value of its last row, and the value that counts for a number. */
export function settingsRows(rows: Array<Record<string, string>>): Array<Record<string, string>> {
  const numbers: Record<string, number> = { ...(teamNumbers(rows) as Record<string, number>), rowsInEmail: rowsInEmailOf(rows) };
  const keys = Array.from(new Set(rows.map((row) => (row.Title ?? '').trim()).filter(Boolean)));
  return keys.map((key) => {
    const value = rows.filter((row) => (row.Title ?? '').trim() === key).pop()!.Value ?? '';
    return { Key: key, Value: value, Used: key in numbers ? String(numbers[key]) : value };
  });
}

export const sampleEvents = (): CaseEvent[] => stateRows('journal').map(journalEvent);
export const sampleReplies = (): Reply[] => stateRows('replies').map(replyOf);
export const sampleRules = (): Rules => rulesOf(stateRows('settings'));

/* ------------------------------------------------------------------ the runs of every report date */

/** The newest run of the samples, as the HTML app records it (tests/recorded/run.json). */
export const newestRun = (): Run => JSON.parse(readFileSync(join(root, 'tests', 'recorded', 'run.json'), 'utf8')) as Run;

/**
 * The checks on the earlier CI report (4 November), with the reports the folder of the Power BI samples holds on or
 * before that day: the earlier Relationship report and the earlier Solusi contract file. There is no EPO systems report
 * and no ServiceNow contract report of that day or before, so those checks say they were not tested.
 */
export async function earlierRun(): Promise<Run> {
  const packs = loadPacks();
  const base = loadReferences();
  const references = withTeamDays(base, {});
  const [ciFile, relFile] = HISTORY_FILES;
  const relationships = readRelationshipReport((await table(relFile.path)).rows).relationships;
  const solusiTable = await table(SAMPLE_FILES.solusiEarlier.path);
  const solusi = readSolusiFile(solusiTable.sheets ?? [{ name: '', rows: solusiTable.rows }], contractConfig(base)!);
  const ciTable = await table(ciFile.path);
  const report = readCiReport(ciTable.rows, { lossless: ciTable.lossless, knownHidden: !ciTable.lossless ? hiddenNames(relationships) : undefined });
  const result = runChecks(report.cis, report.columns, packs, references, {
    relationships, date: HISTORY_DATE, epo: null,
    contracts: { solusi: { contracts: solusi.contracts, date: HISTORY_DATE, report: SAMPLE_FILES.solusiEarlier.name }, servicenow: null }
  });
  const run = buildRun(report.cis, result, packs, HISTORY_DATE, `${HISTORY_DATE}_${ciFile.name}`, references);
  run.notes.push(...hiddenNotes(report));
  return run;
}

/* ------------------------------------------------------------------ what the report must show */

export interface HistoryKey {
  /** The runs of every report date, as the history (HistoryRun) has them: the checks of the reports alone. */
  runs: Run[];
  /** The newest run with the lines of the lifecycle review of the sample journal (fnWithReviews, build B8). */
  reviewed: Run;
  /** The cases, from the earlier run and the reviewed newest run, as the table Run has them. */
  cases: Case[];
  /** The newest report against the one before it. */
  record: VerificationRecord;
  lives: Episode[];
  rules: Rules;
}

/** Everything the parity check compares, worked out once. */
export async function historyKey(): Promise<HistoryKey> {
  const earlier = await earlierRun();
  const newest = newestRun();
  const rules = sampleRules();
  const runs = [earlier, newest];
  const reviewed = withSampleReviews(newest, sampleEvents());
  const cases = buildCases([earlier, reviewed], sampleEvents(), sampleReplies(), RECORD_DATE, rules);
  const record = verificationRecord(newest, earlier, loadPacks(), null);
  return { runs, reviewed, cases, record, lives: episodes(runs.map(slimRun)), rules };
}

/**
 * The CIs a run checked and the parts it could test, as the part HistoryChecked of the table HistoryRun gives them
 * (checkedIn of src/core/cases/cases.ts): Kind "ci", Id the key of each CI of the report that is not parked; Kind
 * "part", Id <check>:<field> of each part tested that is not parked.
 */
export function checkedOf(run: Run): Array<{ Kind: string; Id: string }> {
  const parkedCis = new Set(run.parked?.keys ?? []);
  const parkedFields = new Set(run.parked?.fields ?? []);
  return [
    ...(run.ciKeys ?? []).filter((key) => !parkedCis.has(key)).map((key) => ({ Kind: 'ci', Id: key })),
    ...run.tested.filter((part) => !parkedFields.has(part)).map((part) => ({ Kind: 'part', Id: part }))
  ];
}

/* ------------------------------------------------------------------ the rows each table must give */

const isoDate = (value: string): string => value.slice(0, 10);
const STATE_WORDS: Record<string, string> = { open: 'To solve', review: 'To check', waiting: 'Waiting', known: 'Known' };

const packOf = (id: string) => loadPacks().find((pack) => pack.id === id);

/** The lines of the part CaseLines (fnCases): one per case, as buildCases gives it on the samples. */
export function caseLines(key: HistoryKey): Array<Record<string, string | number | boolean>> {
  const newest = key.reviewed;
  const latest = new Set(newest.facts.map((fact) => fact.key));
  const packs = loadPacks();
  const mapping = mappingConfig(loadReferences());
  const shares = shareOutOf(key.cases, sampleMembers());
  return key.cases.map((item) => {
    const due = !(item.state === 'waiting' && stateOf(item.fact) === 'open');
    const remind = due && item.status === 'Contacted' ? (item.messages.length <= key.rules.maxReminders ? 'reminder' : 'escalation') : '';
    const from = item.sentOn ? addBusinessDays(item.sentOn, key.rules.reminderDays) : '';
    // The two ways the app says it must agree with the columns the measures read.
    if ((remind === 'reminder' && from <= RECORD_DATE) !== item.reminderDue) throw new Error(`${item.key}: Remind and ReminderFrom do not give the reminder of the app`);
    if ((remind === 'escalation' && from <= RECORD_DATE) !== item.overLimit) throw new Error(`${item.key}: Remind and ReminderFrom do not give the escalation of the app`);
    const inLatest = latest.has(item.key);
    const exception = item.exception;
    // Who marked it fixed: the last status or exception of its timeline, which set the status Fixed.
    const fixed = item.status === 'Fixed' ? [...item.timeline].reverse().find((event) => event.type === 'status' || event.type === 'exception') : undefined;
    return {
      Key: item.key, CheckId: item.fact.checkId, CiKey: item.fact.ciKey, Field: item.fact.field,
      // A finding the newest report no longer shows: Power BI knows its key only (the history has the rest).
      CiName: inLatest ? item.fact.ciName : item.fact.ciKey, ClassLabel: inLatest ? item.fact.classLabel : '', ContactName: inLatest ? item.fact.contactName : '',
      InLatest: item.inLatest, Untested: item.untested, CiMissing: item.ciMissing,
      State: inLatest ? item.state : '', StateLabel: inLatest ? STATE_WORDS[item.state] ?? '' : '', Status: item.status, StatusLabel: statusWord(item.status),
      AssignedTo: item.assignedTo, HandoverNote: item.handover?.text ?? '', Request: item.request, Messages: item.messages.length, SentOn: item.sentOn,
      LastMessageTo: item.messages[item.messages.length - 1]?.to ?? '', LastRef: item.messages[item.messages.length - 1]?.ref ?? '',
      ReminderFrom: from, Remind: remind, Replies: item.replies.length, LastReplyOn: isoDate(item.replies[item.replies.length - 1]?.received ?? ''),
      ExceptionReason: exception ? (exception.type === 'status' ? 'Set before version 0.12 (no reason)' : exception.reason ?? '') : '',
      ReviewOn: exception?.reviewOn ?? '', ExceptionEnded: item.exceptionEnded, RetireOn: item.retireOn, VerifiedOn: item.verifiedOn,
      FixedBy: fixed ? fixed.byName || fixed.by : '', FixedOn: fixed ? isoDate(fixed.at) : '', Events: item.timeline.length,
      // Build B6 (D294): who the case is about, and what the Power App offers on it (the case panel of the HTML app).
      Person: inLatest ? personOf(item) : '', ...caseActions(item, inLatest, packs, mapping),
      // Build B7 (D24): who the line goes to when its card is shared out.
      ShareTo: shares.get(item.key) ?? ''
    };
  });
}

/** The lines of the part RepliesToRead: the replies that wait to be read, newest first. */
export function replyLines(key: HistoryKey): Array<Record<string, string | number | boolean>> {
  return repliesToRead(key.cases, '').sort((a, b) => b.received.localeCompare(a.received) || a.file.localeCompare(b.file)).map((reply) => ({
    File: reply.file, Ref: reply.file.split('|')[0]!, From: reply.from, Received: reply.received, FirstLine: reply.firstLine, Cases: reply.cases.length,
    CIs: new Set(reply.cases.map((item) => item.fact.ciKey)).size,
    AssignedTo: Array.from(new Set(reply.cases.map((item) => item.assignedTo).filter(Boolean))).join(', '),
    Checks: Array.from(new Set(reply.cases.map((item) => item.fact.checkId))).join(', '),
    Daily: reply.cases.some((item) => isDaily(packOf(item.fact.checkId)))
  }));
}

/** The lines of the part Exceptions (the tab Not followed of the Audit page), numbered in their order. */
export function exceptionRows(key: HistoryKey): Array<Record<string, string | number | boolean>> {
  const facts = new Map(key.reviewed.facts.map((fact) => [fact.key, fact]));
  const middle = (target: string): string => { const first = target.indexOf(':'); const last = target.lastIndexOf(':'); return first < 0 ? target : last > first ? target.slice(first + 1, last) : target.slice(first + 1); };
  // The part names a finding the newest report no longer shows by the CI of its key (the app: by its last fact).
  const known = new Map(Array.from(facts).map(([id, fact]) => [id, fact]));
  const lines = exceptionLines(sampleEvents(), known, RECORD_DATE);
  return lines.map((line, at) => ({
    Order: at + 1, Target: line.target, CheckId: line.checkId, CiKey: line.standing || known.has(line.target) ? line.ciKey : middle(line.target),
    CiName: line.standing || known.has(line.target) ? line.ciName : middle(line.target), Reason: line.reason, Note: line.note, ReviewOn: line.reviewOn,
    ByName: line.byName, At: line.at, State: line.state, StateLabel: exceptionStateWord(line), Standing: line.standing, Legacy: line.legacy
  }));
}

/**
 * The lines of the table Activity: every journal row in words, then every reply of the list SACM Replies with a time
 * (build D3: who wrote, the subject, the cards of the messages it answers), newest first. Every mailbox email counts as
 * sent. Find holds the words the search box of History looks in.
 */
export function activityRows(packs = loadPacks()): Array<Record<string, string | number>> {
  const events = sampleEvents().sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).reverse();
  const label = new Map(packs.map((pack) => [pack.id, pack.cardLabel ?? pack.title]));
  const sent = new Set(events.map((event) => event.text ?? ''));
  const checkOf = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : id);
  const ciOf = (id: string): string => { const first = id.indexOf(':'); const last = id.lastIndexOf(':'); return first < 0 || last <= first ? '' : id.slice(first + 1, last); };
  const find = (row: Record<string, string | number>): string => [row.What, row.Cards, row.Text, row.By].filter((part) => part !== '').join(' · ');
  const journal = events.map((event) => {
    const line = describeEvent(event, sent);
    const checks = event.keys.map(checkOf).concat(!event.keys.length && event.checkId && event.checkId !== '*' ? [event.checkId] : []);
    return {
      Id: event.id, At: event.at, Type: event.type, Icon: line.icon, What: line.what, By: line.by, Text: line.text,
      Cards: cardWords(checks.map((id) => label.get(id) ?? id)), CIs: new Set(event.keys.map(ciOf).filter(Boolean)).size, Keys: event.keys.length
    };
  });
  const keysByRef = new Map<string, string[]>();
  for (const event of sampleEvents()) {
    if (event.type !== 'message' || !event.ref) continue;
    keysByRef.set(event.ref, Array.from(new Set([...(keysByRef.get(event.ref) ?? []), ...event.keys])));
  }
  const replies = sampleReplies().filter((reply) => reply.received !== '').map((reply) => {
    const keys = keysByRef.get(reply.ref) ?? [];
    return {
      Id: `reply|${reply.ref}|${reply.received}`, At: reply.received, Type: 'reply', Icon: 'reply', What: `Reply from ${reply.from}`, By: reply.from, Text: reply.subject,
      Cards: cardWords(keys.map(checkOf).map((id) => label.get(id) ?? id)), CIs: new Set(keys.map(ciOf).filter(Boolean)).size, Keys: keys.length
    };
  });
  return [...journal, ...replies].map((row) => ({ ...row, Find: find(row) }));
}

/** The rows of the part History of HistoryRun: every finding of every report date. */
export function historyRows(key: HistoryKey): Array<Record<string, string>> {
  return key.runs.flatMap((run) => run.facts.map((fact) => ({
    ReportDate: run.date, Key: fact.key, CheckId: fact.checkId, CiKey: fact.ciKey, CiName: fact.ciName, Class: fact.className, ClassLabel: fact.classLabel,
    Field: fact.field, State: fact.state ?? 'open', SupportGroup: fact.ci?.supportGroup ?? '', ContactName: fact.contactName
  })));
}

/**
 * What the measures of the history must count on the samples, for the Self-check page (the measure History found
 * gives the same for each metric). The newest report is compared with the one before it.
 */
export async function expectedHistory(): Promise<Array<{ metric: string; expected: number }>> {
  const key = await historyKey();
  const [earlier, newest] = key.runs as [Run, Run];
  const firstSeen = new Map<string, string>();
  for (const run of key.runs) for (const fact of run.facts) if (!firstSeen.has(fact.key)) firstSeen.set(fact.key, run.date);
  const now = new Set(newest.facts.map((fact) => fact.key));
  const checked = checkedIn(newest)!;
  const tested = new Set(newest.tested);
  const solved = earlier.facts.filter((fact) => !now.has(fact.key) && tested.has(`${fact.checkId}:${fact.field}`) && checked.has(fact));
  if (solved.length !== key.record.totals.verifiedSince) throw new Error('history.ts: the solved findings are not those of the verification record');
  const days = solved.map((fact) => daysBetween(firstSeen.get(fact.key)!, newest.date));
  const team = stateRows('team').filter((row) => !/^(no|false|0)$/i.test(row.Active!.trim()));
  const me = team[0]?.Title ?? '';
  const open = key.cases.filter((item) => !isClosedStatus(item.status));
  // My day counts the daily cards only (D182).
  const daily = key.cases.filter((item) => isDaily(packOf(item.fact.checkId)));
  return [
    { metric: 'Report dates', expected: key.runs.length },
    { metric: 'Findings in the newest report', expected: newest.facts.length },
    { metric: 'Findings in the report before', expected: earlier.facts.length },
    { metric: 'New since the last report', expected: key.record.totals.newSince },
    { metric: 'Solved since the last report', expected: key.record.totals.verifiedSince },
    { metric: 'Days to fix', expected: days.length ? Math.round(days.reduce((sum, day) => sum + day, 0) / days.length) : 0 },
    { metric: 'Open cases', expected: open.length },
    { metric: 'Reminders due', expected: daily.filter((item) => item.reminderDue).length },
    { metric: 'To escalate', expected: daily.filter((item) => item.overLimit).length },
    { metric: 'Replies to read', expected: replyLines(key).filter((reply) => reply.Daily).length },
    { metric: 'Mine', expected: open.filter((item) => item.assignedTo === me).length },
    { metric: 'Not followed up', expected: exceptionLines(sampleEvents(), new Map(newest.facts.map((fact) => [fact.key, fact])), RECORD_DATE).filter((line) => line.state === 'running').length }
  ];
}
