import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../../src/core/sources/relationships/relationship-report.ts';
import { buildCases, buildRun } from '../../../../src/core/cases/cases.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';

/* Invented data only. The mapping backlog (D200): one case per CI to map, with every reason. */

const packs = loadPacks();
const references = loadReferences();
const DATE = '2026-11-20';
const HEAD = ['name', 'sys_class_name', 'operational_status', 'owned_by', 'owned_by.user_name', 'owned_by.email', 'sys_tags'];

/** name, class, status, tags. */
function cis(rows: Array<[string, string, string?, string?]>) {
  return readCiReport([HEAD].concat(rows.map(([name, className, status = 'Operational', tags = '']) => [name, className, status, 'Ann Owner', 'ann01', 'ann@example.com', tags])));
}
const rels = (rows: Array<[string, string, string]>) =>
  readRelationshipReport([['Parent', 'Type', 'Child']].concat(rows.map(([parent, type, child]) => [parent, type, child]))).relationships;

const ROWS: Array<[string, string, string?, string?]> = [
  ['Pay a bill', 'Business Process'],
  ['Fines_BA', 'Business Application'],
  ['Fines - PROD', 'Service Instance'],
  ['Lonely - PROD', 'Service Instance'],
  ['New - PROD', 'Service Instance', 'Ready'],
  ['Orphan_BS', 'Business Service'],
  ['Old_BA', 'Business Application', 'Operational', 'EPO - Subsystem (To be Deleted)'],
  ['Gone - PROD', 'Service Instance', 'Retired']
];
const RELS: Array<[string, string, string]> = [
  ['Pay a bill', 'Provided by::Provides', 'Fines_BA'],
  ['Fines_BA', 'Consumes::Consumed by', 'Fines - PROD'],
  ['Old_BA', 'Consumes::Consumed by', 'Gone - PROD']
];

function check() {
  const report = cis(ROWS);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, relationships: rels(RELS) });
  const run = buildRun(report.cis, result, packs, DATE, 'r.csv', references);
  return { result, run, facts: run.facts.filter((fact) => fact.checkId === 'MAPPING') };
}

test('the mapping backlog: one line per CI with every reason, and its state', () => {
  const { facts } = check();
  const by = (name: string) => facts.filter((fact) => fact.ciName === name).map((fact) => [(fact.mapping ?? []).join('+'), fact.state]);
  assert.deepEqual(by('Lonely - PROD'), [['si-business-application', 'open']]);
  // Not live yet: the case waits.
  assert.deepEqual(by('New - PROD'), [['si-business-application', 'waiting']]);
  // A Business Service without a process is to solve now, no longer a review (D200 replaces D72).
  assert.deepEqual(by('Orphan_BS'), [['bs-business-process', 'open']]);
  // Three reasons, one case: no process above, no live Service Instance below (a Retired one does not count), tagged to be deleted.
  assert.deepEqual(by('Old_BA'), [['ba-business-process+ba-service-instance+tagged-to-delete', 'open']]);
  assert.match(facts.filter((fact) => fact.ciName === 'Old_BA')[0]!.detail, /Business Application without a Business Process above; Business Application without a Service Instance; Tagged To be deleted/);
  // Mapped CIs, and Retired ones, are not on it.
  assert.deepEqual(by('Fines - PROD'), []);
  assert.deepEqual(by('Gone - PROD'), []);
  assert.deepEqual(by('Pay a bill'), []);
  // One line per CI, each fixed in ServiceNow and asked of the owner (the mapping session).
  assert.equal(new Set(facts.map((fact) => fact.ciKey)).size, facts.length);
  assert.ok(facts.every((fact) => fact.field === 'mapping' && fact.route === '' && fact.contactEmail === 'ann@example.com'));
});

test('the mapping backlog: a tag that plans the mapping makes the case known', () => {
  const report = cis([['Planned - PROD', 'Service Instance', 'Operational', 'To Be Mapped']]);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, relationships: rels([]) });
  const run = buildRun(report.cis, result, packs, DATE, 'r.csv', references);
  assert.deepEqual(run.facts.filter((fact) => fact.checkId === 'MAPPING').map((fact) => [fact.state, fact.stateWhy]), [['known', 'Tagged To Be Mapped']]);
});

test('the rules of the mapping backlog are not on Relationship missing, and the tagged applications not on Deleted but operational', () => {
  const { result } = check();
  const missing = result.findings.filter((finding) => finding.checkId === 'REL-MISSING').map((finding) => finding.field);
  for (const rule of ['si-business-application', 'bs-business-process', 'ba-business-process', 'ba-service-instance', 'bp-application-or-service']) assert.ok(missing.indexOf(rule) < 0, rule);
  assert.equal(result.findings.filter((finding) => finding.checkId === 'TAG-STATUS-CONFLICT' && finding.ciName === 'Old_BA').length, 0);
  assert.equal(result.evaluated['MAPPING:mapping'], 7);
});

test('the mapping backlog is not tested without the Relationship report, and says so', () => {
  const report = cis(ROWS);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE });
  assert.equal(result.findings.filter((finding) => finding.checkId === 'MAPPING').length, 0);
  assert.ok(result.tested.indexOf('MAPPING:mapping') < 0);
  assert.ok(result.notes.some((note) => note.checkId === 'MAPPING' && /no Relationship report/.test(note.note)));
  // A case stays as it is when a later report cannot test it.
  const before = check().run;
  const later = buildRun(report.cis, result, packs, '2026-11-21', 'r2.csv', references);
  const cases = buildCases([before, later], [], [], '2026-11-21', { reminderDays: 3, maxReminders: 2 }).filter((item) => item.fact.checkId === 'MAPPING');
  assert.ok(cases.length > 0 && cases.every((item) => item.untested && item.status !== 'Verified'));
});
