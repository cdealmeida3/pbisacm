import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../../src/core/sources/relationships/relationship-report.ts';
import { REVIEWED_ASK, REVIEWED_BACK, buildCases, buildRun } from '../../../../src/core/cases/cases.ts';
import { buildDrafts } from '../../../../src/core/messages/messages.ts';
import { validateCheckFiles } from '../../../../src/core/checks/check-files.ts';
import { loadPackFiles, loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import type { CaseEvent } from '../../../../src/core/cases/cases.ts';

/* Invented data only. A small chain: process → application → instance, with criticality in the order C, I, A, A. */

const packs = loadPacks();
const references = loadReferences();
const rules = { reminderDays: 3, maxReminders: 2 };
const DATE = '2026-11-20';

const LEVELS = ['confidentiality', 'integrity', 'availability', 'authenticity'];
const HEAD = ['name', 'sys_class_name', 'operational_status', 'owned_by', 'owned_by.user_name', 'owned_by.email', 'sys_tags', 'sys_updated_on']
  .concat(LEVELS.map((level) => `x_demo_crit_target_${level}`), LEVELS.map((level) => `x_demo_crit_inherited_${level}`));

/** name, class, target (four digits or ''), inherited (four digits or ''), status, updated, tags. */
type Row = [string, string, string, string, string?, string?, string?];
function cis(rows: Row[]) {
  const levels = (text: string): string[] => (text ? text.split('') : ['', '', '', '']);
  return readCiReport([HEAD].concat(rows.map(([name, className, target, inherited, status = 'Operational', updated = '2026-10-01', tags = '']) =>
    [name, className, status, 'Ann Owner', 'ann01', 'ann@example.com', tags, updated, ...levels(target), ...levels(inherited)])));
}
/** parent, child, excluded ('true' or 'false'). */
function rels(rows: Array<[string, string, string?]>) {
  return readRelationshipReport([['Parent', 'Type', 'Child', 'Excluded for calculation']].concat(rows.map(([parent, child, excluded = 'false']) => [parent, 'Depends on::Used by', child, excluded]))).relationships;
}
function findings(rows: Row[], relationships: ReturnType<typeof rels> | null, id: string) {
  const report = cis(rows);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, relationships });
  return { result, report, found: result.findings.filter((finding) => finding.checkId === id) };
}

const CHAIN: Row[] = [
  ['Pay Customers', 'Business Process', '3333', ''],
  ['Pay Engine', 'Business Application', '3333', '3333'],
  ['Pay Engine - PROD', 'Service Instance', '3433', '3333'],
  ['Side Tool', 'Business Application', '4444', '']
];

test('CRIT-ABOVE-PARENT: a Target above every value the parents pass on, per dimension; a review for SACM first', () => {
  const { found } = findings(CHAIN, rels([['Pay Customers', 'Pay Engine'], ['Pay Engine', 'Pay Engine - PROD']]), 'CRIT-ABOVE-PARENT');
  assert.deepEqual(found.map((finding) => `${finding.ciName}/${finding.field}`), ['Pay Engine - PROD/integrity']);
  assert.equal(found[0]!.detail, 'Integrity: Target is Mission/Business critical, higher than every parent (highest Critical (Vital), from Pay Engine)');
  assert.equal(found[0]!.review, 'SACM checks the mapping first: a parent relationship may be missing');
  // A CI with no parent passing anything is not raised: a Target without Inherited is fine.
  assert.ok(!found.some((finding) => finding.ciName === 'Side Tool'));
});

test('CRIT-ABOVE-PARENT: a parent over a relationship excluded from calculation does not count (D131)', () => {
  // Side Tool (4444) is a parent too, so Pay Engine - PROD is not above its parents; excluded, it does not count.
  const counted = findings(CHAIN, rels([['Pay Engine', 'Pay Engine - PROD'], ['Side Tool', 'Pay Engine - PROD']]), 'CRIT-ABOVE-PARENT').found;
  assert.equal(counted.length, 0);
  const excluded = findings(CHAIN, rels([['Pay Engine', 'Pay Engine - PROD'], ['Side Tool', 'Pay Engine - PROD', 'true']]), 'CRIT-ABOVE-PARENT').found;
  assert.deepEqual(excluded.map((finding) => finding.field), ['integrity']);
  assert.match(excluded[0]!.detail, /Not counted \(excluded from calculation\): Side Tool$/);
  // Without the Relationship report: compared with the Inherited field, and the run says so.
  const { found, result } = findings(CHAIN, null, 'CRIT-ABOVE-PARENT');
  assert.deepEqual(found.map((finding) => `${finding.ciName}/${finding.field}`), ['Pay Engine - PROD/integrity']);
  assert.ok(result.notes.some((note) => note.checkId === 'CRIT-ABOVE-PARENT' && /Parents not known: no Relationship report/.test(note.note)));
});

test('CRIT-ABOVE-PARENT: "Mapping done: ask owner" makes it to solve, and the owner gets the criticality message', () => {
  const { report, result } = findings(CHAIN, rels([['Pay Engine', 'Pay Engine - PROD']]), 'CRIT-ABOVE-PARENT');
  const run = buildRun(report.cis, result, packs, DATE, 'x.csv', references);
  const key = 'CRIT-ABOVE-PARENT:pay engine - prod:integrity';
  assert.equal(run.facts.find((fact) => fact.key === key)!.state, 'review');
  const at = (minute: number, text: string): CaseEvent => ({ id: `r${minute}`, at: `2026-11-20T09:0${minute}:00`, by: 'lena@example.com', byName: 'Lena', type: 'reviewed', keys: [key], text });
  const stateAfter = (events: CaseEvent[]) => buildCases([run], events, [], DATE, rules).find((item) => item.key === key)!;
  assert.equal(stateAfter([]).state, 'review');
  const asked = stateAfter([at(1, REVIEWED_ASK)]);
  assert.deepEqual([asked.state, asked.fact.contactEmail], ['open', 'ann@example.com']);
  const draft = buildDrafts([asked], packs, { portalLink: '', signature: 'SACM team' }, () => 'SACM-C1').drafts[0]!.plain;
  assert.match(draft, /higher than every value the parent CIs pass on/);
  assert.match(draft, /lower it with the request/);
  // Back to the review list: the last mark decides.
  assert.equal(stateAfter([at(1, REVIEWED_ASK), at(2, REVIEWED_BACK)]).state, 'review');
});

test('CRIT-NONE-REACHES: nothing inherited is a SACM review linked to the mapping; Inherited set waits two weeks (D132)', () => {
  const rows: Row[] = [
    ['Pay Customers', 'Business Process', '3333', ''],
    ['Lonely App', 'Business Application', '', ''],
    ['Child App', 'Business Application', '', ''],
    ['Cut App', 'Business Application', '', ''],
    ['Fresh - PROD', 'Service Instance', '', '3333', 'Operational', '2026-11-15'],
    ['Stale - PROD', 'Service Instance', '', '3333', 'Operational', '2026-10-01'],
    ['Assessed App', 'Business Application', '2222', ''],
    ['Draft App', 'Business Application', '', '', 'Ready'],
    ['Pending App', 'Business Application', '', '', 'Operational', '2026-10-01', 'BIA is pending']
  ];
  const { report, result, found } = findings(rows, rels([['Pay Customers', 'Child App'], ['Pay Customers', 'Cut App', 'true']]), 'CRIT-NONE-REACHES');
  const detail = (name: string): string => found.find((finding) => finding.ciName === name)?.detail ?? '';
  assert.equal(detail('Lonely App'), 'No criticality reaches this CI: no parent relationship');
  assert.equal(detail('Child App'), 'No criticality reaches this CI: the parent Pay Customers has a criticality, but nothing is inherited yet');
  assert.equal(detail('Cut App'), 'No criticality reaches this CI: only parents over a relationship excluded from calculation have a criticality: Pay Customers');
  assert.equal(found.find((finding) => finding.ciName === 'Fresh - PROD')!.wait, 'Inherited is set: ServiceNow copies it to Target after 2 weeks');
  assert.equal(detail('Stale - PROD'), 'Inherited is set, but Target is still empty 50 days after the last change: ServiceNow did not copy it');
  // A Target without Inherited is fine; a Business Process is on CRIT-TARGET-MISSING.
  assert.ok(!found.some((finding) => finding.ciName === 'Assessed App' || finding.ciName === 'Pay Customers'));

  const state = (name: string) => buildRun(report.cis, result, packs, DATE, 'x.csv', references).facts.find((fact) => fact.checkId === 'CRIT-NONE-REACHES' && fact.ciName === name)!;
  assert.deepEqual(['Lonely App', 'Fresh - PROD', 'Stale - PROD', 'Draft App', 'Pending App'].map((name) => state(name).state), ['review', 'waiting', 'review', 'waiting', 'known']);
  // Without the Relationship report it still runs, without the mapping words.
  assert.equal(findings(rows, null, 'CRIT-NONE-REACHES').found.find((finding) => finding.ciName === 'Lonely App')!.detail, 'No criticality reaches this CI');
});

test('CRIT-TARGET-MISSING: only a Business Process, a SACM line; Ready gives no line (D132, D186)', () => {
  const rows: Row[] = [
    ['Pay Customers', 'Business Process', '', ''],
    ['New Process', 'Business Process', '', '', 'Ready'],
    ['Lonely App', 'Business Application', '', '']
  ];
  const { report, result, found } = findings(rows, null, 'CRIT-TARGET-MISSING');
  assert.deepEqual(found.map((finding) => finding.ciName), ['Pay Customers']);
  // Nobody is written to: SACM checks the status or the tag (SACM does not chase the BIA).
  const facts = buildRun(report.cis, result, packs, DATE, 'x.csv', references).facts.filter((fact) => fact.checkId === 'CRIT-TARGET-MISSING');
  assert.deepEqual(facts.map((fact) => [fact.ciName, fact.state, fact.contactEmail, !!fact.fix]), [['Pay Customers', 'open', '', true]]);
});

test('playbook.askAfterReview: a text, with a message, never on a review-only check', () => {
  const files = loadPackFiles().map((file) => file.pack as Record<string, unknown>);
  const above = files.find((pack) => pack['id'] === 'CRIT-ABOVE-PARENT')!;
  const playbook = above['playbook'] as Record<string, unknown>;
  assert.equal(playbook['askAfterReview'], 'Mapping done: ask owner');
  const broken = { ...above, reviewOnly: true, playbook: { ...playbook, askAfterReview: '', message: undefined } };
  const problems = validateCheckFiles([broken], references);
  assert.ok(problems.some((problem) => /askAfterReview must be a text/.test(problem)));
  assert.ok(problems.some((problem) => /not with reviewOnly/.test(problem)));
  assert.ok(problems.some((problem) => /askAfterReview needs playbook.message/.test(problem)));
});
