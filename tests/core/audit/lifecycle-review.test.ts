import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { buildCases, buildRun } from '../../../src/core/cases/cases.ts';
import { runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { EVIDENCE_COLUMNS, drawReview, evidenceRows, marksOf, parseReview, reviewCaseKey, reviewFix, reviewProgress, withReviewFacts } from '../../../src/core/audit/lifecycle-review.ts';
import { mappedOf, reviewConfig } from '../../../src/core/cases/inventory.ts';
import { askable } from '../../../src/app/view/fix-list.ts';
import { REVIEWED_ASK } from '../../../src/core/cases/cases.ts';
import { cardSummaries } from '../../../src/app/view/cards.ts';
import { peopleOf } from '../../../src/app/view/people.ts';
import type { AppRun } from '../../../src/app/view/people.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import type { CaseEvent } from '../../../src/core/cases/cases.ts';

/* The lifecycle review, on invented data only. */

const packs = loadPacks();
const references = loadReferences();
const config = reviewConfig(references)!;
const pack = packs.find((candidate) => candidate.id === 'LIFECYCLE-REVIEW')!;
const rules = { reminderDays: 3, maxReminders: 2 };

/** 120 live Service Instances, 30 Under retirement, 10 Retired. `changed`: names whose status is Operational in this report. */
function report(date: string, changed: string[] = []): AppRun {
  const lines = ['name,sys_class_name,asset_tag,operational_status,owned_by,owned_by.user_name,owned_by.email,owned_by.active'];
  for (let n = 1; n <= 160; n++) {
    const name = `System ${String(n).padStart(3, '0')} - PROD`;
    const status = changed.indexOf(name) >= 0 ? 'Operational' : n > 150 ? 'Retired' : n > 120 ? 'Under retirement' : 'Operational';
    lines.push([name, 'Service Instance', String(1000 + n), status, 'Ada Example', 'ada', 'ada@example.com', 'true'].join(','));
  }
  const read = readCiReport(parseCsv(lines.join('\n')));
  const core = buildRun(read.cis, runChecks(read.cis, read.columns, packs, references, { date }), packs, date, 'cmdb_ci.csv', references);
  return { ...core, people: peopleOf(read.cis, (core.inventory ?? []).map((row) => row[0])) };
}
let counter = 0;
const mark = (ref: string, ciKey: string, result: string, at: string, text = '', by = 'Lena'): CaseEvent =>
  ({ id: `m${++counter}`, at, by: `${by.toLowerCase()}@example.com`, byName: by, type: 'review', keys: [], ref, ciKey, ciName: ciKey, reason: result, text });

test('the sample: 50 by chance and 20 Under retirement, never a Retired CI, the same on every computer', () => {
  const run = report('2026-11-10');
  assert.equal(run.inventory!.length, 150);
  const review = drawReview(run, '2026-11-11', config)!;
  assert.equal(review.id, '2026-11-11_lifecycle');
  assert.deepEqual([review.items.filter((item) => item.group === 'sample').length, review.items.filter((item) => item.group === 'under-retirement').length], [50, 20]);
  assert.equal(new Set(review.items.map((item) => item.ciKey)).size, 70);
  assert.equal(review.items.filter((item) => item.group === 'sample').every((item) => item.status === 'Operational'), true);
  assert.equal(review.items.filter((item) => item.group === 'under-retirement').every((item) => item.status === 'Under retirement'), true);
  // Two computers that press the button the same day write the same bytes, whatever the order of the CIs in memory.
  const shuffled = { ...run, inventory: run.inventory!.slice().reverse() };
  assert.equal(JSON.stringify(drawReview(shuffled, '2026-11-11', config)), JSON.stringify(review));
  assert.deepEqual(parseReview(JSON.stringify(review)), review);
  // Another day gives another sample; nobody and no time is in the file.
  assert.notEqual(JSON.stringify(drawReview(run, '2027-05-11', config)!.items), JSON.stringify(review.items));
  assert.equal(/Lena|loadedBy|T\d\d:/.test(JSON.stringify(review)), false);
  // Only the classes EPO holds are drawn: a Business Application is not in EPO, so there is nothing to compare.
  const mixed = { ...run, inventory: run.inventory!.concat(Array.from({ length: 300 }, (_, n): [string, string, string, string, string, string, string] => [`app ${n}_ba`, `App ${n}_BA`, 'Business Application', 'business_application', n % 2 ? 'Operational' : 'Under retirement', '', ''])) };
  assert.deepEqual(config.classes, ['business_service', 'service_offering', 'service_instance']);
  assert.equal(drawReview(mixed, '2026-11-11', config)!.items.every((item) => item.className === 'service_instance'), true);
  // Fewer CIs than the sample asks: all of them. A run of an older version has no CI list.
  const few = { ...run, inventory: run.inventory!.slice(0, 5) };
  assert.equal(drawReview(few, '2026-11-11', config)!.items.length, 5);
  assert.equal(drawReview({ date: run.date, report: run.report }, '2026-11-11', config), null);
});

test('marks: the last answer of a CI counts, progress is counted, another review is not mixed in', () => {
  const review = drawReview(report('2026-11-10'), '2026-11-11', config)!;
  const [a, b] = [review.items[0]!.ciKey, review.items[1]!.ciKey];
  const events = [
    mark(review.id, a, 'different', '2026-11-11T09:00:00'), mark(review.id, a, 'same', '2026-11-11T09:05:00', 'Looked again', 'Nia'),
    mark(review.id, b, 'not-in-epo', '2026-11-11T09:10:00'), mark('2026-05-11_lifecycle', review.items[2]!.ciKey, 'same', '2026-05-11T09:00:00')
  ];
  const marks = marksOf(review, events);
  assert.deepEqual([marks.get(a)!.result, marks.get(a)!.byName, marks.get(a)!.note], ['same', 'Nia', 'Looked again']);
  assert.deepEqual(reviewProgress(review, marks), { checked: 2, total: 70 });
});

test('"Not the same" opens a case with the owner as contact; a later report with another status verifies it', () => {
  const first = report('2026-11-10');
  const review = drawReview(first, '2026-11-11', config)!;
  const item = review.items.find((candidate) => candidate.group === 'under-retirement')!;
  const other = review.items[0]!;
  const events = [mark(review.id, item.ciKey, 'different', '2026-11-11T09:00:00', 'EPO says Operational'), mark(review.id, other.ciKey, 'same', '2026-11-11T09:01:00')];
  const key = reviewCaseKey(item.ciKey);

  // No review, or no mark: the runs are untouched and the card is grey.
  assert.equal(withReviewFacts([first], [], events, pack, references)[0], first);
  assert.equal(cardSummaries([pack], first, [], new Map())[0]!.light, 'grey');

  const runs = withReviewFacts([first], [review], events, pack, references);
  assert.equal(first.facts.some((fact) => fact.checkId === pack.id), false);
  const fact = runs[0]!.facts.find((candidate) => candidate.key === key)!;
  assert.deepEqual([fact.contactEmail, fact.contactVia, fact.state, fact.module, fact.ci!.epoId], ['ada@example.com', 'owned by', 'open', 'compliance', item.epoId]);
  assert.match(fact.detail, /Status in ServiceNow is Under retirement; EPO does not show the same \(lifecycle review of 11 Nov 2026, Lena\): EPO says Operational/);
  assert.equal(runs[0]!.facts.filter((candidate) => candidate.checkId === pack.id).length, 1);
  // The source first (D192): a SACM line. This report has no service mapped column, so the line says both ways.
  assert.equal(pack.playbook.path, 'sacm-fix');
  assert.deepEqual(fact.fix, reviewFix('Under retirement', null));
  assert.match(fact.fix!.change, /Service mapped: copy the status of EPO\. Not service mapped: raise an incident with the ServiceNow development team/);
  assert.match(reviewFix('Ready', true).change, /copy the status of EPO into ServiceNow/);
  assert.match(reviewFix('Ready', false).change, /the sync did not bring the status of EPO\. Raise an incident with the ServiceNow development team/);
  assert.equal(mappedOf(first.inventory![0]!), null);
  assert.equal(mappedOf(['k', 'N', 'Service Instance', 'service_instance', 'Ready', '1', '', 'true']), true);
  assert.equal(mappedOf(['k', 'N', 'Service Instance', 'service_instance', 'Ready', '1', '']), null);
  // The owner is written to only after the button "EPO itself looks wrong: ask the owner".
  const fresh = buildCases(runs, events, [], '2026-11-11', rules).find((found) => found.key === key)!;
  assert.equal(askable(pack, fresh), false);
  const handed = buildCases(runs, events.concat([{ id: 'r1', at: '2026-11-11T10:00:00', by: 'lena@example.com', byName: 'Lena', type: 'reviewed', keys: [key], text: REVIEWED_ASK }]), [], '2026-11-11', rules).find((found) => found.key === key)!;
  assert.equal(askable(pack, handed), true);
  let cases = buildCases(runs, events, [], '2026-11-11', rules);
  assert.equal(cases.find((found) => found.key === key)!.status, 'New');
  assert.equal(cardSummaries([pack], runs[0], cases, new Map())[0]!.light, 'red');

  // The next report still shows Under retirement: still to solve. Then the status changes: Verified.
  const sent: CaseEvent = { id: 's1', at: '2026-11-12T10:00:00', by: 'lena@example.com', byName: 'Lena', type: 'message', keys: [key], ref: 'SACM-R1', to: 'ada@example.com', kind: 'first' };
  const second = withReviewFacts([first, report('2026-11-17')], [review], events, pack, references);
  cases = buildCases(second, events.concat([sent]), [], '2026-11-17', rules);
  assert.deepEqual([cases.find((found) => found.key === key)!.status, cases.find((found) => found.key === key)!.inLatest], ['Contacted', true]);
  const third = withReviewFacts([first, report('2026-11-17'), report('2026-11-24', [item.name])], [review], events, pack, references);
  cases = buildCases(third, events.concat([sent]), [], '2026-11-24', rules);
  assert.deepEqual([cases.find((found) => found.key === key)!.status, cases.find((found) => found.key === key)!.verifiedOn], ['Verified', '2026-11-24']);
  assert.equal(cardSummaries([pack], third[2], cases, new Map())[0]!.light, 'green');

  // A manager who looks again and marks "same" takes the case away.
  const again = events.concat([mark(review.id, item.ciKey, 'same', '2026-11-11T11:00:00')]);
  assert.equal(withReviewFacts([first], [review], again, pack, references)[0]!.facts.some((candidate) => candidate.key === key), false);
});

test('the evidence file: the sample, the result, who checked and when, and the follow-up of each case', () => {
  const first = report('2026-11-10');
  const review = drawReview(first, '2026-11-11', config)!;
  const [a, b] = [review.items[0]!, review.items[1]!];
  const key = reviewCaseKey(a.ciKey);
  const events: CaseEvent[] = [
    mark(review.id, a.ciKey, 'different', '2026-11-11T09:00:00', 'EPO says Retired'), mark(review.id, b.ciKey, 'not-in-epo', '2026-11-11T09:02:00', '', 'Nia'),
    { id: 's1', at: '2026-11-12T10:00:00', by: 'lena@example.com', byName: 'Lena', type: 'message', keys: [key], ref: 'SACM-R1', to: 'ada@example.com', kind: 'first' },
    { id: 's2', at: '2026-11-18T10:00:00', by: 'lena@example.com', byName: 'Lena', type: 'message', keys: [key], ref: 'SACM-R1', to: 'ada@example.com', kind: 'reminder' },
    { id: 's3', at: '2026-11-25T10:00:00', by: 'lena@example.com', byName: 'Lena', type: 'message', keys: [key], ref: 'SACM-R2', to: 'boss@example.com', kind: 'escalation' }
  ];
  const cases = buildCases(withReviewFacts([first], [review], events, pack, references), events, [], '2026-11-26', rules);
  const rows = evidenceRows(review, marksOf(review, events), cases, config);
  assert.equal(rows.length, 70);
  assert.equal(rows.every((cells) => cells.length === EVIDENCE_COLUMNS.length), true);
  assert.deepEqual(rows[0]!.slice(2), ['Sample by chance', a.name, 'Service Instance', a.epoId, 'Operational', '', 'Not the same', 'EPO says Retired', 'Lena', '2026-11-11', 'Contacted', '2026-11-12', '2026-11-18', '2026-11-25']);
  assert.deepEqual(rows[1]!.slice(8), ['Not in EPO', '', 'Nia', '2026-11-11', '', '', '', '']);
  assert.deepEqual(rows[2]!.slice(8), ['Not checked yet', '', '', '', '', '', '', '']);
  assert.equal(rows[69]![2], 'Under retirement');
});
