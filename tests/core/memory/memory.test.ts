import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { buildCases, buildRun } from '../../../src/core/cases/cases.ts';
import type { CaseEvent, Reply, Run } from '../../../src/core/cases/cases.ts';
import { dateInName, localDate, reportCandidates, runFileName } from '../../../src/core/memory/finder.ts';
import { compact, eventsByMonth, handledReplies, journalPath, parseJournal, rebuildReason, splitRuns, STATE_VERSION, writeJournal } from '../../../src/core/memory/memory.ts';
import type { MemoryState } from '../../../src/core/memory/memory.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import { editSample } from '../../helpers.ts';

const sample = readFileSync(join(import.meta.dirname, '../../..', 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const packs = loadPacks();
const references = loadReferences();
const rules = { reminderDays: 3, maxReminders: 2 };

function run(csv: string, date: string): Run {
  const report = readCiReport(parseCsv(csv));
  return buildRun(report.cis, runChecks(report.cis, report.columns, packs, references), packs, date, 'cmdb_ci.csv', references);
}
let counter = 0;
const event = (values: Partial<CaseEvent>): CaseEvent => ({ id: `e${++counter}`, at: '2026-09-30T09:00:00', by: 'lena@example.com', byName: 'Lena', type: 'note', keys: [], ...values });
const reply = (ref: string, received: string): Reply => ({ ref, from: 'x@example.com', received, subject: `RE: [${ref}] Data`, text: 'Done', file: `${ref}.json` });

/* ------------------------------------------------------------------ finding the newest report */

test('the report date comes from the file name, else from the last change', () => {
  assert.equal(dateInName('2026-11-12_cmdb_ci.csv'), '2026-11-12');
  assert.equal(dateInName('cmdb_ci.csv'), '');
  assert.equal(dateInName('2026-13-01_cmdb_ci.csv'), '');
  // 23:30 UTC is already the next day one hour east of UTC.
  assert.equal(localDate(Date.UTC(2026, 10, 12, 23, 30), -60), '2026-11-13');
});

test('the newest CSV wins: dated names first by date, then the last change; other files are ignored', () => {
  const day = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);
  const files = [
    { path: 'reports/2026-11-10_cmdb_ci.csv', name: '2026-11-10_cmdb_ci.csv', modified: day('2026-11-14') },
    { path: 'reports/2026-11-12_cmdb_ci.csv', name: '2026-11-12_cmdb_ci.csv', modified: day('2026-11-12') },
    { path: 'cmdb_ci.csv', name: 'cmdb_ci.csv', modified: day('2026-11-11') },
    { path: 'SACM-Workbench.html', name: 'SACM-Workbench.html', modified: day('2026-11-20') },
    { path: 'reports/notes.txt', name: 'notes.txt', modified: day('2026-11-20') }
  ];
  const found = reportCandidates(files, 0);
  // A file renamed later keeps the date in its name: 2026-11-10 is older than 2026-11-12 even though it changed later.
  assert.deepEqual(found.map((file) => [file.path, file.date, file.dateFrom]), [
    ['reports/2026-11-12_cmdb_ci.csv', '2026-11-12', 'name'],
    ['cmdb_ci.csv', '2026-11-11', 'modified'],
    ['reports/2026-11-10_cmdb_ci.csv', '2026-11-10', 'name']
  ]);
  // The same report on the same date gives the same run file, so it is never loaded twice.
  assert.equal(runFileName('2026-11-12', '2026-11-12_cmdb_ci.csv'), '2026-11-12_2026-11-12_cmdb_ci.csv.json');
  assert.equal(runFileName('2026-11-12', 'CMDB CI.csv'), '2026-11-12_cmdb_ci.csv.json');
});

/* ------------------------------------------------------------------ keeping the memory small */

test('only the last 10 runs stay active', () => {
  const files = Array.from({ length: 12 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}_cmdb_ci.csv.json`).reverse();
  const { active, archive } = splitRuns(files);
  assert.equal(active.length, 10);
  assert.deepEqual(archive, ['2026-10-01_cmdb_ci.csv.json', '2026-10-02_cmdb_ci.csv.json']);
  assert.deepEqual(splitRuns(files.slice(0, 3)).archive, []);
});

test('journals are split by month, and writing merges without duplicates', () => {
  const events = [event({ at: '2026-10-31T23:00:00' }), event({ at: '2026-11-01T08:00:00' }), event({ at: '2026-11-02T08:00:00' })];
  const months = eventsByMonth(events);
  assert.deepEqual(Array.from(months.keys()), ['2026-10', '2026-11']);
  assert.equal(months.get('2026-11')!.length, 2);
  const text = writeJournal(events.concat(events.slice(1)));
  assert.equal(parseJournal(text).length, 3);
  assert.equal(parseJournal('not json\n{"id":"x"}').length, 0);
  assert.equal(journalPath('2026-11', 'lena_example.com'), 'data/journal/2026-11/lena_example.com.jsonl');
});

test('state.json is rebuilt when it is missing, from another version, or clashes', () => {
  const state = { version: STATE_VERSION, archivedRuns: ['a.json'] } as MemoryState;
  assert.equal(rebuildReason(null, [], ['b.json'], []), '');
  assert.match(rebuildReason(null, ['a.json'], [], []), /missing/);
  assert.equal(rebuildReason(state, ['a.json'], ['b.json'], []), '');
  assert.match(rebuildReason({ ...state, version: 0 }, ['a.json'], [], []), /version/);
  assert.match(rebuildReason(state, ['a.json'], [], ['state-PC01.json']), /conflict copy/);
  assert.match(rebuildReason(state, ['a.json', 'c.json'], [], []), /do not match/);
  assert.match(rebuildReason(state, ['a.json'], ['a.json'], []), /both active and archived/);
});

/**
 * Twelve reports: two in September, ten in October. The two September runs are archived.
 *   member engine (owner missing)   fixed from the third report, worked on in September → closed and dropped
 *   reconcile index (owner left)    in every report, first seen in September → kept, first seen date kept
 *   reconcile index (description)   waived in September → stays waived
 *   fines hub - prod              missing from the October reports (partial reports) → still open, kept from the summary
 */
function scenario() {
  const fixed = ['owned_by', 'Ada Example', 'owned_by.email', 'ada@example.com', 'owned_by.active', 'TRUE'];
  let october = sample;
  for (let at = 0; at < fixed.length; at += 2) october = editSample(october, 'Manage Member Records', fixed[at]!, fixed[at + 1]!);
  october = parseCsv(october).filter((cells) => cells[0]!.toLowerCase().replace(/\s+/g, ' ') !== 'fines hub - prod').map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const runs = [run(sample, '2026-09-29'), run(sample, '2026-09-30')];
  for (let day = 1; day <= 10; day += 1) runs.push(run(october, `2026-10-${String(day).padStart(2, '0')}`));
  const engine = 'RESP-MISSING:manage member records:owned_by';
  const index = 'RESP-INACTIVE:reconcile index:owned_by';
  const waived = 'DESC-QUALITY:reconcile index:description';
  const hub = 'SUPPORT-GROUP-MISSING:fines hub - prod:support_group';
  const events = [
    event({ type: 'message', keys: [engine], ref: 'SACM-AAA', to: 'cy@example.com', subject: '[SACM-AAA] Owner', kind: 'first' }),
    event({ type: 'message', keys: [index, hub], ref: 'SACM-BBB', to: 'cy@example.com', subject: '[SACM-BBB] Data', kind: 'first' }),
    event({ type: 'status', keys: [waived], text: 'Waived' }),
    event({ type: 'note', keys: [index], text: 'Asked again', at: '2026-10-05T10:00:00' })
  ];
  const replies = [reply('SACM-AAA', '2026-09-30T12:00:00'), reply('SACM-BBB', '2026-09-30T13:00:00'), reply('SACM-ZZZ', '2026-09-01T08:00:00')];
  return { runs, events, replies, keys: { engine, index, waived, hub } };
}

test('the summary plus the last 10 runs give the same open cases as the full history', () => {
  const { runs, events, replies, keys } = scenario();
  const full = buildCases(runs, events, replies, '2026-10-10', rules);
  const active = runs.slice(2);
  const journalFrom = '2026-10';
  const recentEvents = events.filter((item) => item.at >= journalFrom);
  const handled = handledReplies(replies, full, journalFrom);
  // The reply on the fixed CI and the stray reply are handled; the reply on the open cases is not.
  assert.deepEqual(handled.map((item) => item.ref).sort(), ['SACM-AAA', 'SACM-ZZZ']);

  const state = compact({
    prior: null, foldRuns: runs.slice(0, 2), foldEvents: events.filter((item) => item.at < journalFrom), foldReplies: handled,
    active, recentEvents, openReplies: replies.filter((item) => handled.indexOf(item) < 0),
    archivedRuns: ['2026-09-29_cmdb_ci.csv.json', '2026-09-30_cmdb_ci.csv.json'], journalFrom, today: '2026-10-10', rules
  });
  // Only the findings that still matter are in the summary.
  // The CI missing from the October reports keeps all three of its open findings.
  assert.deepEqual(Object.keys(state.facts).sort(), ['NAME-DUPLICATE:fines hub - prod:name', keys.hub, 'TAG-STATUS-CONFLICT:fines hub - prod:tags']);
  assert.equal(state.firstSeen[keys.engine], undefined);
  assert.equal(state.firstSeen[keys.index], '2026-09-29');
  assert.deepEqual(state.events.map((item) => item.ref ?? item.text), ['SACM-BBB', 'Waived']);
  assert.ok(JSON.stringify(state).length < JSON.stringify(runs).length / 10);

  const now = buildCases(active, state.events.concat(recentEvents), state.replies.concat(replies.filter((item) => handled.indexOf(item) < 0)), '2026-10-10', rules, state);
  const before = new Map(full.map((item) => [item.key, item]));
  for (const item of now) {
    const old = before.get(item.key)!;
    assert.deepEqual([item.status, item.firstSeen, item.timeline.length, item.replies.length, item.ciMissing], [old.status, old.firstSeen, old.timeline.length, old.replies.length, old.ciMissing], item.key);
  }
  const status = (key: string): string => now.find((item) => item.key === key)?.status ?? 'dropped';
  assert.deepEqual([status(keys.engine), status(keys.index), status(keys.waived), status(keys.hub)], ['dropped', 'Answered', 'Not followed up', 'Answered']);
  assert.equal(now.length, full.length - 1);
});

test('folding in steps gives the same summary as rebuilding from all files', () => {
  const { runs, events, replies } = scenario();
  const common = { rules, foldReplies: [] as Reply[], openReplies: replies };
  const journalFrom = '2026-10';
  const once = compact({ ...common, prior: null, foldRuns: runs.slice(0, 2), foldEvents: events.filter((item) => item.at < journalFrom), active: runs.slice(2), recentEvents: events.filter((item) => item.at >= journalFrom), archivedRuns: ['1', '2'], journalFrom, today: '2026-10-10' });
  const first = compact({ ...common, prior: null, foldRuns: runs.slice(0, 1), foldEvents: [], active: runs.slice(1, 11), recentEvents: events, archivedRuns: ['1'], journalFrom: '2026-09', today: '2026-10-09' });
  const second = compact({ ...common, prior: first, foldRuns: runs.slice(1, 2), foldEvents: events.filter((item) => item.at < journalFrom), active: runs.slice(2), recentEvents: events.filter((item) => item.at >= journalFrom), archivedRuns: ['1', '2'], journalFrom, today: '2026-10-10' });
  assert.deepEqual(second, once);
});
