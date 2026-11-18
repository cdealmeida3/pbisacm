import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, auditCsvFiles, auditSummary, csvText, daysBetween, episodes, exceptionLines, monthPeriod, quarterPeriod, settingsChanges, slimRun, teamChanges, testedText, verificationRecord } from '../../../src/core/audit/audit.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPacks } from '../../../src/hosts/cli.ts';
import { buildCases, groupCases } from '../../../src/core/cases/cases.ts';
import { compact } from '../../../src/core/memory/memory.ts';
import type { CaseEvent, Fact, Run } from '../../../src/core/cases/cases.ts';
import type { CheckPack } from '../../../src/core/model/model.ts';

let counter = 0;
const event = (values: Partial<CaseEvent>): CaseEvent => ({ id: `e${String(++counter).padStart(3, '0')}`, at: '2026-11-12T09:00:00', by: 'ana@example.com', byName: 'Ana', type: 'note', keys: [], ...values });
const fact = (ci: string, values: Partial<Fact> = {}): Fact => ({
  key: `OWNER:${ci}:owned_by`, checkId: 'OWNER', ciKey: ci, ciName: ci.toUpperCase(), className: 'business_application', field: 'owned_by', detail: 'Owner missing',
  classLabel: 'Business Application', module: 'completeness', route: '', contactName: 'Dee', contactEmail: 'dee@example.com', contactId: 'dee', contactVia: 'managed by', cc: [], ...values
} as Fact);
const run = (date: string, facts: Fact[], ciKeys: string[], values: Partial<Run> = {}): Run => ({
  date, report: 'cmdb_ci.csv', cis: ciKeys.length, facts, tested: ['OWNER:owned_by'], evaluated: { 'OWNER:owned_by': ciKeys.length }, ciKeys, notes: [], ...values
});
const pack = (id: string, label: string): CheckPack => ({ id, title: label, cardLabel: label, family: 'x', dimension: 'completeness', severity: 'high', status: 'proposed', scope: { classes: [] }, detector: { type: 'rule' }, playbook: { path: 'email', audience: [] } });
const packs = [pack('OWNER', 'Owner missing'), pack('CRIT', 'Criticality missing')];
const rules = { reminderDays: 3, maxReminders: 2 };

test('dates: months later, calendar days, a month and a quarter', () => {
  assert.equal(addMonths('2026-11-12', 6), '2027-05-12');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(daysBetween('2026-11-01', '2026-11-12'), 11);
  assert.deepEqual(monthPeriod('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(quarterPeriod('2026-11-12'), { from: '2026-10-01', to: '2026-12-31' });
});

test('csv: byte order mark, CRLF, quoted, no formulas', () => {
  const text = csvText(['A', 'B'], [['=1+1', 'say "hi"'], [3, 'x']]);
  assert.equal(text, '﻿"A","B"\r\n"\'=1+1","say ""hi"""\r\n"3","x"\r\n');
});

test('an exception accepted closes the case until its review date, then the case is to solve again', () => {
  const runs = [run('2026-11-12', [fact('ci-1')], ['ci-1'])];
  const accepted = event({ type: 'exception', keys: ['OWNER:ci-1:owned_by'], reason: 'Agreed with the owner', reviewOn: '2027-05-12', text: 'Owner leaves; new one named in May' });
  let item = buildCases(runs, [accepted], [], '2026-11-13', rules)[0]!;
  assert.equal(item.status, 'Not followed up');
  assert.equal(item.exception?.reason, 'Agreed with the owner');
  // A message after the exception does not reopen it.
  item = buildCases(runs, [accepted, event({ type: 'message', keys: ['OWNER:ci-1:owned_by'], ref: 'SACM-1', at: '2026-11-14T09:00:00' })], [], '2026-11-15', rules)[0]!;
  assert.equal(item.status, 'Not followed up');
  // The review date passed: back to solve, with the date it ended.
  item = buildCases(runs, [accepted], [], '2027-05-12', rules)[0]!;
  assert.equal(item.status, 'New');
  assert.equal(item.exceptionEnded, '2027-05-12');
  // A later status ends it by hand.
  item = buildCases(runs, [accepted, event({ type: 'status', keys: ['OWNER:ci-1:owned_by'], text: 'Fix in progress', at: '2026-11-20T09:00:00' })], [], '2026-11-21', rules)[0]!;
  assert.equal(item.status, 'Fix in progress');
  // An old "Waived" reads as an exception accepted without a review date.
  item = buildCases(runs, [event({ type: 'status', keys: ['OWNER:ci-1:owned_by'], text: 'Waived' })], [], '2030-01-01', rules)[0]!;
  assert.equal(item.status, 'Not followed up');
  assert.equal(groupCases([item])[0]!.status, 'Not followed up');
});

test('an exception entered for a CI before any finding covers the finding when it is raised', () => {
  const standing = event({ type: 'exception', keys: [], checkId: '*', ciKey: 'ci-2', ciName: 'CI-2', reason: 'Not a CI', reviewOn: '2027-01-01', at: '2026-11-01T09:00:00' });
  const runs = [run('2026-11-12', [fact('ci-1'), fact('ci-2'), fact('ci-2|tag-9', { key: 'OWNER:ci-2|tag-9:owned_by', ciName: 'CI-2' })], ['ci-1', 'ci-2', 'ci-2|tag-9'])];
  const cases = buildCases(runs, [standing], [], '2026-11-12', rules);
  const status = (ci: string): string => cases.filter((item) => item.fact.ciKey === ci)[0]!.status;
  assert.equal(status('ci-1'), 'New');
  assert.equal(status('ci-2'), 'Not followed up');
  assert.equal(status('ci-2|tag-9'), 'Not followed up');
  // Only for its own check when one is named.
  const onCrit = buildCases(runs, [{ ...standing, checkId: 'CRIT' }], [], '2026-11-12', rules);
  assert.equal(onCrit.filter((item) => item.fact.ciKey === 'ci-2')[0]!.status, 'New');
});

test('the Exceptions page: one line per case or standing exception, with its state', () => {
  const facts = new Map([['OWNER:ci-1:owned_by', { checkId: 'OWNER', ciKey: 'ci-1', ciName: 'CI-1' }], ['OWNER:ci-3:owned_by', { checkId: 'OWNER', ciKey: 'ci-3', ciName: 'CI-3' }]]);
  const events = [
    event({ type: 'exception', keys: ['OWNER:ci-1:owned_by'], reason: 'Duplicate record', reviewOn: '2026-12-01', at: '2026-11-01T09:00:00' }),
    event({ type: 'exception', keys: [], checkId: '*', ciKey: 'ci-2', ciName: 'CI-2', reason: 'Not a CI', reviewOn: '2027-06-01', at: '2026-11-02T09:00:00' }),
    event({ type: 'status', keys: ['OWNER:ci-3:owned_by'], text: 'Waived', at: '2026-10-01T09:00:00' }),
    event({ type: 'status', keys: ['OWNER:ci-3:owned_by'], text: 'New', at: '2026-10-05T09:00:00' })
  ];
  const lines = exceptionLines(events, facts, '2026-12-15');
  assert.deepEqual(lines.map((line) => [line.ciName, line.state, line.standing, line.legacy]), [
    ['CI-2', 'running', true, false], ['CI-1', 'ended', false, false], ['CI-3', 'closed', false, true]
  ]);
});

test('the verification record of a load: tested, to solve, new and verified since the last report, not tested and why', () => {
  const previous = run('2026-11-05', [fact('ci-1'), fact('ci-2')], ['ci-1', 'ci-2', 'ci-3']);
  const now = run('2026-11-12', [fact('ci-1'), fact('ci-3'), fact('ci-4', { state: 'waiting' })], ['ci-1', 'ci-2', 'ci-3', 'ci-4'], { notes: ['CRIT: column u_criticality missing', 'Routing: something general'] });
  const record = verificationRecord(now, previous, packs, { name: 'Ana', at: '2026-11-12T08:55:00' });
  const owner = record.checks[0]!;
  assert.equal(record.verifier, 'Ana');
  assert.deepEqual([owner.tested, owner.toSolve, owner.other, owner.newSince, owner.verifiedSince], [4, 2, 1, 1, 1]);
  assert.deepEqual(record.checks[1]!.notTested, ['column u_criticality missing']);
  assert.deepEqual(record.general, ['Routing: something general']);
  // A check with no column and no note still says it was not tested.
  const silent = verificationRecord(run('2026-11-12', [], ['ci-1'], { tested: [], evaluated: {} }), null, packs, null);
  assert.equal(silent.checks[0]!.notTested.length, 1);
  assert.equal(silent.previous, '');
});

test('episodes: a finding ends on the first report that contains the CI, tests the check and no longer shows it', () => {
  const runs = [
    run('2026-10-01', [fact('ci-1'), fact('ci-2')], ['ci-1', 'ci-2']),
    // ci-2 is not in this partial report: it stays open.
    run('2026-10-08', [fact('ci-1')], ['ci-1']),
    run('2026-10-15', [], ['ci-1', 'ci-2']),
    run('2026-10-22', [fact('ci-1')], ['ci-1', 'ci-2'])
  ].map(slimRun);
  const lives = episodes(runs);
  const of = (ci: string) => lives.filter((life) => life.fact.ciKey === ci).map((life) => [life.firstSeen, life.verifiedOn]);
  assert.deepEqual(of('ci-1'), [['2026-10-01', '2026-10-15'], ['2026-10-22', '']]);
  assert.deepEqual(of('ci-2'), [['2026-10-01', '2026-10-15']]);
});

test('the audit export of a period: loads, findings, actions, verified with days, open with age, exceptions', () => {
  const runs = [
    run('2026-09-25', [fact('ci-1'), fact('ci-2')], ['ci-1', 'ci-2', 'ci-3']),
    run('2026-10-10', [fact('ci-1'), fact('ci-3')], ['ci-1', 'ci-2', 'ci-3']),
    run('2026-10-20', [fact('ci-3')], ['ci-1', 'ci-2', 'ci-3']),
    run('2026-11-05', [], ['ci-1', 'ci-2', 'ci-3'])
  ].map(slimRun);
  const events = [
    event({ type: 'report', text: 'Loaded the CI report cmdb_ci.csv (report of 2026-10-10)', ref: '2026-10-10_cmdb_ci.csv.json', at: '2026-10-10T08:00:00', byName: 'Oskar' }),
    event({ type: 'message', keys: ['OWNER:ci-1:owned_by'], to: 'dee@example.com', subject: 'Owner missing on CI-1', ref: 'SACM-1', at: '2026-10-11T09:00:00' }),
    event({ type: 'message', kind: 'reminder', keys: ['OWNER:ci-1:owned_by'], to: 'dee@example.com', ref: 'SACM-1', at: '2026-10-16T09:00:00' }),
    event({ type: 'exception', keys: ['OWNER:ci-3:owned_by'], reason: 'Agreed with the owner', reviewOn: '2027-04-20', at: '2026-10-21T09:00:00' }),
    event({ type: 'settings', text: 'Working days before a reminder: 3 → 5', at: '2026-10-22T09:00:00' }),
    event({ type: 'message', keys: ['OWNER:ci-1:owned_by'], to: 'x@example.com', at: '2026-11-02T09:00:00' })
  ];
  const summary = auditSummary({ period: monthPeriod('2026-10'), runs, events, replies: [{ ref: 'SACM-1', from: 'dee', received: '2026-10-12T10:00:00', subject: 'RE', text: 'ok', file: 'r1' }], packs, today: '2026-11-11' });
  assert.deepEqual(summary.loads.map((load) => [load.date, load.verifier]), [['2026-10-10', 'Oskar'], ['2026-10-20', 'not known']]);
  assert.deepEqual(summary.found, [{ check: 'Owner missing', findings: 2, cis: 2, newInPeriod: 1 }]);
  assert.deepEqual(summary.actionCounts.map((row) => `${row.action} ${row.count}`), ['Email 1', 'Not followed up 1', 'Reminder 1', 'Reply received 1', 'Report loaded 1', 'Settings changed 1']);
  assert.deepEqual(summary.verified.map((row) => [row.ciName, row.firstSeen, row.verifiedOn, row.days]), [['CI-2', '2026-09-25', '2026-10-10', 15], ['CI-1', '2026-09-25', '2026-10-20', 25]]);
  assert.deepEqual(summary.open.map((row) => [row.ciName, row.ageDays, row.exception]), [['CI-3', 21, true]]);
  assert.equal(summary.exceptions.length, 1);
  assert.deepEqual(summary.days, { average: 20, longest: 25 });
  const files = auditCsvFiles(summary, (id) => id);
  assert.deepEqual(Object.keys(files), ['loads.csv', 'findings.csv', 'actions.csv', 'verified.csv', 'open.csv', 'not-followed-up.csv']);
  assert.match(files['actions.csv']!, /Settings changed/);
  // No report in the period: said, never silent.
  assert.equal(auditSummary({ period: monthPeriod('2025-01'), runs, events, replies: [], packs, today: '2026-11-11' }).notes.length, 1);
});

test('settings and team changes in words', () => {
  assert.deepEqual(settingsChanges({ reminderDays: 3, requests: { owner: { name: 'Update owner', link: '' } } }, { reminderDays: 5, requests: { owner: { name: 'Update owner', link: 'https://portal.example.com/x' } } }, { reminderDays: 'Working days before a reminder' }),
    ['Working days before a reminder: 3 → 5', 'requests.owner.link: (empty) → https://portal.example.com/x']);
  assert.deepEqual(settingsChanges({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(teamChanges([{ name: 'Ana', email: 'ana@example.com' }, { name: 'Bo', email: 'bo@example.com' }], [{ name: 'Ana B', email: 'ANA@example.com' }, { name: 'Cy', email: 'cy@example.com' }]),
    ['Renamed Ana to Ana B in the team list', 'Added Cy (cy@example.com) to the team list', 'Removed Bo (bo@example.com) from the team list']);
});

test('the summary keeps standing and running exceptions of old journal months', () => {
  const standing = event({ type: 'exception', keys: [], checkId: '*', ciKey: 'ci-9', ciName: 'CI-9', reason: 'Not a CI', reviewOn: '2027-06-01', at: '2026-08-01T09:00:00' });
  const running = event({ type: 'exception', keys: ['OWNER:ci-8:owned_by'], reason: 'Duplicate record', reviewOn: '2027-06-01', at: '2026-08-02T09:00:00' });
  const state = compact({
    prior: null, foldRuns: [], foldEvents: [standing, running, event({ type: 'note', keys: ['OWNER:ci-8:owned_by'], at: '2026-08-03T09:00:00' })], foldReplies: [],
    active: [run('2026-11-12', [fact('ci-1')], ['ci-1'])], recentEvents: [], openReplies: [], archivedRuns: [], journalFrom: '2026-11', today: '2026-11-12', rules
  });
  assert.deepEqual(state.events.map((item) => item.id), [standing.id, running.id]);
});

test('the verification record of the invented samples is exact: every tested check gives its number and its unit; no lifecycle review, no check switched off (F15)', () => {
  const sample = JSON.parse(readFileSync(join(import.meta.dirname, '../../recorded/run.json'), 'utf8')) as Run;
  const all = loadPacks();
  const record = verificationRecord(sample, null, all, { name: 'Demo User', at: '2026-11-11T08:00:00Z' });
  assert.equal(record.checks.some((check) => check.checkId === 'LIFECYCLE-REVIEW'), false);
  assert.equal(record.checks.some((check) => all.filter((item) => item.id === check.checkId)[0]!.status === 'off'), false);
  for (const check of record.checks.filter((item) => item.wasTested)) {
    // A tested check with 0 says why (nothing of its scope was in the report).
    assert.ok(check.tested > 0 || check.notTested.length > 0, check.label);
  }
  for (const id of ['READY-TOO-LONG', 'UNDER-RETIREMENT-LONG']) assert.ok(record.checks.filter((check) => check.checkId === id)[0]!.tested > 0, id);
  const byId = (id: string) => record.checks.filter((check) => check.checkId === id)[0]!;
  assert.match(testedText(byId('CONTRACT-NOT-IN-SOLUSI')), /^\d+ contracts?$/);
  assert.match(testedText(byId('REL-WRONG-TYPE')), /^\d+ relationships?$/);
  assert.match(testedText(byId('RESP-MISSING')), /^\d+ CIs?$/);
  assert.equal(testedText(byId('NAME-HIDDEN-CHAR')), 'Not tested');
});
