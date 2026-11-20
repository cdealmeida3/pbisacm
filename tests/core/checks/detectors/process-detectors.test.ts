import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../../src/core/sources/relationships/relationship-report.ts';
import { buildCases, buildRun } from '../../../../src/core/cases/cases.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import { asLive } from '../../../helpers.ts';

/* Invented data only. The stages of a Business Process in Ready (D197). */

const packs = asLive(loadPacks());
const references = loadReferences();
const DATE = '2026-11-20';
const LEVELS = ['confidentiality', 'integrity', 'availability', 'authenticity'];
const HEAD = ['name', 'sys_class_name', 'operational_status', 'owned_by', 'owned_by.user_name', 'owned_by.email'].concat(LEVELS.map((level) => `x_demo_crit_target_${level}`));

/** name, class, status, target (four digits or ''). */
function cis(rows: Array<[string, string, string, string]>) {
  return readCiReport([HEAD].concat(rows.map(([name, className, status, target]) => [name, className, status, 'Pia Owner', 'pia01', 'pia@example.com', ...(target ? target.split('') : ['', '', '', ''])])));
}
const rels = (rows: Array<[string, string]>) =>
  readRelationshipReport([['Parent', 'Type', 'Child']].concat(rows.map(([parent, child]) => [parent, 'Provided by::Provides', child]))).relationships;

const ROWS: Array<[string, string, string, string]> = [
  ['Wait for the BIA', 'Business Process', 'Ready', ''],
  ['Plan the Mapping', 'Business Process', 'Ready', '3322'],
  ['Mapped Already', 'Business Process', 'Ready', '2222'],
  ['Running Process', 'Business Process', 'Operational', '2222'],
  ['Old Process', 'Business Process', 'Retired', '2222'],
  ['Fines App', 'Business Application', 'Operational', ''],
  ['Gone App', 'Business Application', 'Retired', '']
];

test('a Business Process in Ready: waits for the BIA (a note), to map (the mapping backlog), or mapped (make it Operational)', () => {
  const report = cis(ROWS);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, relationships: rels([['Mapped Already', 'Fines App'], ['Plan the Mapping', 'Gone App']]) });
  const found = result.findings.filter((finding) => finding.checkId === 'PROCESS-STAGE');
  // A Retired application below does not count: the process is still to map.
  // To map is a case of the mapping backlog (D200): only the mapped process is a line here.
  assert.deepEqual(found.map((finding) => [finding.ciName, finding.field, finding.fix?.change, finding.fix?.set]), [
    ['Mapped Already', 'mapped', 'Operational status: make it Operational', 'Operational']
  ]);
  assert.match(found[0]!.detail, /Fines App linked below/);
  assert.ok(result.notes.some((note) => note.checkId === 'PROCESS-STAGE' && note.note === '1 Business Process in Ready waits for the BIA (no CIA values yet): nothing to do.'));
  assert.ok(result.notes.some((note) => note.checkId === 'PROCESS-STAGE' && /1 Business Process in Ready is to map .*Mapping backlog/.test(note.note)));
  assert.equal(result.evaluated['PROCESS-STAGE'], 3);
  // The mapping backlog: the process to map is to solve now (not waiting on Ready); the one waiting for the BIA has no case.
  const mapping = result.findings.filter((finding) => finding.checkId === 'MAPPING');
  // An Operational process with nothing below is a case too, and so is an application without a Service Instance.
  assert.deepEqual(mapping.map((finding) => [finding.ciName, finding.mapping, finding.wait ?? '']), [
    ['Plan the Mapping', ['bp-application-or-service'], ''], ['Running Process', ['bp-application-or-service'], ''], ['Fines App', ['ba-service-instance'], '']
  ]);
  // SACM's own list: it does not wait on Ready, and nobody is asked.
  const run = buildRun(report.cis, result, packs, DATE, 'r.csv', references);
  const cases = buildCases([run], [], [], DATE, { reminderDays: 3, maxReminders: 2 }).filter((item) => item.fact.checkId === 'PROCESS-STAGE');
  assert.deepEqual(cases.map((item) => [item.state, item.fact.contactEmail]), [['open', '']]);
  // The mapping case of the process goes to the process owner (the mapping session), not to Process Management.
  const map = buildCases([run], [], [], DATE, { reminderDays: 3, maxReminders: 2 }).filter((item) => item.fact.checkId === 'MAPPING' && item.fact.ciName === 'Plan the Mapping');
  assert.deepEqual(map.map((item) => [item.state, item.fact.contactEmail]), [['open', 'pia@example.com']]);
});

test('without the Relationship report the process stages are not tested, and the run says so', () => {
  const report = cis(ROWS);
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE });
  assert.equal(result.findings.filter((finding) => finding.checkId === 'PROCESS-STAGE').length, 0);
  assert.ok(result.tested.indexOf('PROCESS-STAGE') < 0);
  assert.ok(result.notes.some((note) => note.checkId === 'PROCESS-STAGE' && /no Relationship report/.test(note.note)));
});
