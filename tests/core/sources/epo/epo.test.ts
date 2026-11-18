import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../../../src/core/reading/csv.ts';
import { buildCases, buildRun, stateOf } from '../../../../src/core/cases/cases.ts';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { CHANGED_CHIP } from '../../../../src/core/checks/detectors/epo-detectors.ts';
import { compareEpo, correctedInEpo, descriptionDifference, epoConfig, lettersOf, plainText, readEpoReport, systemsById } from '../../../../src/core/sources/epo/epo-report.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { recogniseReport } from '../../../../src/core/sources/report-types.ts';
import { agreeingWithEpo, epoStatusOf } from '../../../../src/core/audit/lifecycle-review.ts';
import { decodeBytes } from '../../../../src/core/shared/text.ts';
import { epoCorrection } from '../../../../src/app/view/cases.ts';
import { peopleIndex, peopleOf } from '../../../../src/app/view/people.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import type { EpoInput } from '../../../../src/core/sources/epo/epo-report.ts';
import type { Review } from '../../../../src/core/audit/lifecycle-review.ts';

/* The EPO systems report compared with the CI report on invented data only. */

const packs = loadPacks();
const references = loadReferences();
const config = epoConfig(references)!;
const DATE = '2026-11-11';

const CI_HEADER = 'name,sys_class_name,asset_tag,operational_status,short_description,owned_by,owned_by.user_name,owned_by.email,managed_by,managed_by.user_name,managed_by.email,supported_by,supported_by.user_name,supported_by.email,ref_cmdb_ci_service.u_service_mapped';
const EPO_HEADER = 'EPOID;SystemName;SystemDescription;SystemStatus;OwnerDepartment;Owner;Responsible1;Responsible2;BusinessCriticality;PlatformBusinessCriticality;GDPRData;GDPRAwarenessForm;AJOUR_TMS';

/** A Service Instance: name, EPO ID, status, description, owner, managed, supported (user IDs), service mapped. */
function ci(name: string, tag: string, status: string, description: string, owner: string, managed: string, supported: string, mapped: boolean): string {
  const person = (id: string): string[] => (id ? [`Person ${id.toUpperCase()}`, id, `${id}@example.com`] : ['', '', '']);
  return [name, 'Service Instance', tag, status, description, ...person(owner), ...person(managed), ...person(supported), mapped ? 'true' : 'false'].map((cell) => `"${cell}"`).join(',');
}

const CIS = [
  // Mapped, EPO has a new owner (changed in EPO after the last EPO report).
  ci('Alpha - PROD', 'E-1', 'Operational', 'Alpha does the first thing', 'ann', 'bob', 'cat', true),
  // Not mapped, the Secondary Responsible was removed in EPO but ServiceNow still shows the person.
  ci('Beta - PROD', 'E-2', 'Operational', 'Beta does the second thing', 'ann', 'bob', 'cat', false),
  // Not mapped, changed in EPO the day before the report: waits for the sync.
  ci('Gamma - PROD', 'E-3', 'Operational', 'Gamma', 'ann', 'bob', '', false),
  // Retired on both sides: not compared.
  ci('Delta - PROD', 'E-4', 'Retired', '', '', '', '', false),
  // The same in EPO, but the description in ServiceNow is cut.
  ci('Epsilon - PROD', 'E-5', 'Operational', 'Epsilon keeps the', 'ann', 'bob', 'cat', true)
];

const EPO_ROWS = [
  '"E-1";"Alpha";"<p>Alpha does the <b>first</b> thing</p>";"Kørende";"D1";"DAN";"bob";"CAT";"2";"";"Y";"Y";"05-11-2026 10:00:00"',
  '"E-2";"Beta";"<p>Beta does the second thing</p>";"Kørende";"D1";"ann";"bob";"";"2";"";"Y";"Y";"01-10-2026 10:00:00"',
  '"E-3";"Gamma";"Gamma";"Kørende";"D1";"ann";"eve";"";"2";"";"Y";"Y";"10-11-2026 17:00:00"',
  '"E-4";"Delta";"";"Nedlagt";"D1";"";"";"";"";"";"N";"N";"01-01-2025 10:00:00"',
  '"E-5";"Epsilon";"<p>Epsilon keeps the index&nbsp;of every library.</p>";"Kørende";"D1";"ann";"bob";"cat";"2";"";"Y";"Y";"01-06-2026 10:00:00"',
  // Running in EPO, and no Service Instance has its EPO ID.
  '"E-9";"Zeta";"";"Konstruktion";"D1";"ann";"";"";"";"";"N";"N";"01-11-2026 10:00:00"'
];

function setup(options: { epo?: boolean; previousDate?: string; header?: string } = {}) {
  const header = options.header ?? CI_HEADER;
  const keep = CI_HEADER.split(',').map((column) => header.split(',').indexOf(column) >= 0);
  const csv = [header].concat(CIS.map((line) => parseCsv(line)[0]!.filter((_, at) => keep[at]).map((cell) => `"${cell}"`).join(','))).join('\n');
  const report = readCiReport(parseCsv(csv));
  const read = readEpoReport(parseCsv(`﻿${[EPO_HEADER].concat(EPO_ROWS).join('\r\n')}`), config);
  const epo: EpoInput | null = options.epo === false ? null : { systems: read.systems, date: DATE, report: 'epo.csv', previousDate: options.previousDate ?? '2026-11-04' };
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, epo });
  const run = buildRun(report.cis, result, packs, DATE, 'ci.csv', references);
  return { report, read, result, run };
}

const factsOf = (run: ReturnType<typeof setup>['run'], check: string) => run.facts.filter((fact) => fact.checkId === check);

test('EPO systems report: recognised by its columns, read with ";", a byte order mark, day-first dates and HTML', () => {
  assert.equal(recogniseReport(EPO_HEADER.split(';')).type?.kind, 'epo');
  const { read } = setup();
  assert.equal(read.systems.length, 6);
  const alpha = read.systems[0]!;
  assert.equal(alpha.epoId, 'E-1');
  assert.equal(alpha.status, 'Operational');
  assert.equal(alpha.statusWord, 'Kørende');
  assert.equal(alpha.changed, '2026-11-05');
  assert.equal(alpha.description, 'Alpha does the first thing');
  assert.equal(read.systems[3]!.status, 'Retired');
  assert.equal(plainText('<p class={Q}x{Q}>A&amp;B&nbsp;&#67;</p><p>D</p>'), 'A&B C D');
  assert.equal(lettersOf('Hello, World! 42'), 'helloworld42');
  const unknown = readEpoReport(parseCsv(`${EPO_HEADER}\n"E-1";"A";"";"Unclear";"";"";"";"";"";"";"";"";""`), config);
  assert.match(unknown.notes.join(' '), /Status words not known: Unclear/);
  assert.equal(unknown.systems[0]!.status, '');
});

test('the invented EPO sample reads and matches the CI sample', () => {
  const bytes = readFileSync('samples/epo-systems-sample.csv');
  const read = readEpoReport(parseCsv(decodeBytes(bytes)), config);
  assert.equal(read.systems.length, 6);
  assert.deepEqual(read.notes, []);
  const report = readCiReport(parseCsv(readFileSync('samples/cmdb_ci-sample.csv', 'utf8')));
  const comparison = compareEpo(report.cis, read.systems, report.columns, config);
  assert.equal(comparison.pairs.length, 4);
  assert.deepEqual(comparison.withoutCi.map((system) => system.epoId), ['AST-0030']);
});

test('comparing: status, name (EPO name + " - PROD") and the three people by user ID, upper and lower case alike', () => {
  const { report, read } = setup();
  const comparison = compareEpo(report.cis, read.systems, report.columns, config);
  assert.equal(comparison.retiredBoth, 1);
  assert.equal(comparison.pairs.length, 4);
  assert.deepEqual(comparison.withoutCi.map((system) => system.name), ['Zeta']);
  const alpha = comparison.pairs.filter((pair) => pair.ci.name === 'Alpha - PROD')[0]!;
  // "bob" and "CAT" are the same people in either case: only the owner differs.
  assert.deepEqual(alpha.differences.map((item) => [item.field, item.current, item.epo]), [['owned_by', 'Person ANN (ann)', 'dan']]);
  // Epsilon has the same people; only its description in ServiceNow is cut (compared by letters and digits only).
  assert.deepEqual(comparison.pairs.filter((pair) => pair.ci.name === 'Epsilon - PROD')[0]!.differences.map((item) => item.field), ['description']);
  // Without the description column, it is not compared, and the comparison says so.
  const header = CI_HEADER.replace('short_description,', '');
  const keep = CI_HEADER.split(',').map((column) => header.split(',').indexOf(column) >= 0);
  const plain = readCiReport(parseCsv([header].concat(CIS.map((line) => parseCsv(line)[0]!.filter((_, at) => keep[at]).map((cell) => `"${cell}"`).join(','))).join('\n')));
  const without = compareEpo(plain.cis, read.systems, plain.columns, config);
  assert.equal(without.pairs.some((pair) => pair.differences.some((item) => item.field === 'description')), false);
  assert.match(without.notes.join(' '), /no description column/);
});

test('EPO ≠ ServiceNow: a service mapped CI with a new owner in EPO is a line of the SACM fix list, with the chip when it changed since the last EPO report', () => {
  const { run } = setup();
  const facts = factsOf(run, 'EPO-DIFF').filter((fact) => fact.field !== 'description');
  assert.equal(facts.length, 1);
  const fact = facts[0]!;
  assert.equal(fact.key, 'EPO-DIFF:alpha - prod:owned_by');
  assert.equal(stateOf(fact), 'open');
  assert.deepEqual(fact.fix, { change: 'Owned by', current: 'Person ANN (ann)', set: 'dan, from EPO', value: 'dan' });
  assert.deepEqual(fact.ci?.chips, [CHANGED_CHIP]);
  assert.match(fact.detail, /EPO has dan \(last change in EPO: 5 November 2026\)/);
  // Without an earlier EPO report there is no chip, and the card says why.
  const first = setup({ previousDate: '' });
  assert.equal(factsOf(first.run, 'EPO-DIFF')[0]!.ci?.chips, undefined);
  assert.equal(first.run.notes.some((note) => /^EPO-DIFF: The chip/.test(note)), true);
});

test('EPO update not arrived: a difference is listed for a review, a change of yesterday waits; a leftover is not here but asked of the owner (D190)', () => {
  const { run, report, read } = setup();
  const facts = factsOf(run, 'EPO-NOT-ARRIVED');
  // Beta still shows a person EPO removed: the sync never clears a field, so it is not a fault to report. The owner fills the role in EPO.
  assert.deepEqual(facts.filter((fact) => fact.ciName === 'Beta - PROD'), []);
  const beta = compareEpo(report.cis, read.systems, report.columns, config).pairs.filter((pair) => pair.ci.name === 'Beta - PROD')[0]!;
  assert.deepEqual(beta.differences.map((item) => [item.field, item.current, item.epo, item.leftover]), [['supported_by', 'Person CAT (cat)', 'nobody', true]]);
  const asked = factsOf(run, 'SUPPORTED-BY').filter((fact) => fact.ciName === 'Beta - PROD');
  assert.deepEqual(asked.map((fact) => [fact.field, stateOf(fact), fact.route]), [['supported_by', 'open', 'epo']]);
  assert.equal(asked[0]!.detail, 'Supported by is empty in EPO (Secondary Responsible); ServiceNow still shows Person CAT (cat), because the sync never clears a field');
  const gamma = facts.filter((fact) => fact.ciName === 'Gamma - PROD');
  assert.deepEqual(gamma.map((fact) => [fact.field, stateOf(fact)]), [['managed_by', 'waiting']]);
  assert.match(gamma[0]!.stateWhy ?? '', /1 day before the report/);
  assert.equal(run.notes.some((note) => /EPO-NOT-ARRIVED: 1 EPO system that is not Retired has no Service Instance with its EPO ID: Zeta \(E-9\)/.test(note)), true);
  // Never red: a review list.
  assert.equal(facts.some((fact) => stateOf(fact) === 'open'), false);
});

test('the description is compared too (D136): by letters and digits only; a cut description of a service mapped CI is on EPO ≠ ServiceNow, formatting is not', () => {
  const { run, report, read } = setup();
  const facts = run.facts.filter((fact) => fact.field === 'description' && fact.checkId.startsWith('EPO-'));
  // Epsilon is service mapped: SACM copies the EPO text. Alpha's formatting differs from EPO, its words do not.
  assert.deepEqual(facts.map((fact) => [fact.checkId, fact.ciName, stateOf(fact)]), [['EPO-DIFF', 'Epsilon - PROD', 'open']]);
  assert.match(facts[0]!.detail, /stops before the end/);
  assert.equal(facts[0]!.fix?.set, '"Epsilon keeps the index of every library.", from EPO');
  assert.equal(run.tested.indexOf('EPO-DIFF:description') >= 0 && run.tested.indexOf('EPO-NOT-ARRIVED:description') >= 0, true);
  // The card "Description differs from EPO" is gone: its differences are on the two cards above.
  assert.equal(packs.some((pack) => pack.id === 'EPO-DESCRIPTION'), false);
  const pairs = compareEpo(report.cis, read.systems, report.columns, config).pairs;
  assert.equal(descriptionDifference(pairs.filter((pair) => pair.ci.name === 'Alpha - PROD')[0]!.ci, pairs.filter((pair) => pair.ci.name === 'Alpha - PROD')[0]!.system, config), '');
  const empty = { ...pairs[0]!.ci, description: '' };
  assert.equal(descriptionDifference(empty, pairs[0]!.system, config), 'empty');
  const other = { ...pairs[0]!.ci, description: 'Something else entirely, not at all like the EPO text' };
  assert.equal(descriptionDifference(other, pairs[0]!.system, config), 'start');
});

test('without an EPO systems report the two cards are not tested and say so (grey, never green)', () => {
  const { run } = setup({ epo: false });
  for (const id of ['EPO-DIFF', 'EPO-NOT-ARRIVED']) {
    assert.equal(run.tested.some((entry) => entry.startsWith(`${id}:`)), false, id);
    assert.equal(run.notes.some((note) => note.startsWith(`${id}: Not tested: no EPO systems report`)), true, id);
  }
  // Without the service mapped column the two people cards cannot tell who brings the value.
  const flagless = setup({ header: CI_HEADER.replace(',ref_cmdb_ci_service.u_service_mapped', '') });
  assert.equal(flagless.run.notes.some((note) => /^EPO-DIFF: Not tested: the CI report has no "service mapped" column/.test(note)), true);
  // Without user IDs, people cannot be compared: the card says so and tests status and name only.
  const noIds = setup({ header: CI_HEADER.split(',').filter((column) => !/user_name/.test(column)).join(',') });
  assert.equal(noIds.run.tested.indexOf('EPO-DIFF:owned_by'), -1);
  assert.equal(noIds.run.tested.indexOf('EPO-DIFF:status') >= 0, true);
  assert.equal(noIds.run.notes.some((note) => /no user ID column for Owned by, Managed by, Supported by/.test(note)), true);
});

test('a fix list line is Verified when a later CI report shows the EPO value', () => {
  const before = setup().run;
  const fixedCis = CIS.map((line) => line.replace('"Alpha - PROD","Service Instance","E-1","Operational","Alpha does the first thing","Person ANN","ann","ann@example.com"', '"Alpha - PROD","Service Instance","E-1","Operational","Alpha does the first thing","Person DAN","dan","dan@example.com"'));
  const report = readCiReport(parseCsv([CI_HEADER].concat(fixedCis).join('\n')));
  const read = readEpoReport(parseCsv([EPO_HEADER].concat(EPO_ROWS).join('\n')), config);
  const later = buildRun(report.cis, runChecks(report.cis, report.columns, packs, references, { date: '2026-11-18', epo: { systems: read.systems, date: '2026-11-18', report: 'epo2.csv', previousDate: DATE } }), packs, '2026-11-18', 'ci2.csv', references);
  const key = 'EPO-DIFF:alpha - prod:owned_by';
  // A manager marked the line as fixed; only the later report makes it Verified.
  const fixed = { id: 'e1', at: '2026-11-12T09:00:00', by: 'sam@example.com', byName: 'Sam', type: 'status' as const, keys: [key], text: 'Fixed' };
  assert.equal(buildCases([before], [fixed], [], '2026-11-12', { reminderDays: 3, maxReminders: 2 }).filter((item) => item.key === key)[0]!.status, 'Fixed');
  assert.equal(later.facts.some((fact) => fact.key === key), false);
  const cases = buildCases([before, later], [fixed], [], '2026-11-18', { reminderDays: 3, maxReminders: 2 });
  assert.equal(cases.filter((item) => item.key === key)[0]!.status, 'Verified');
});

test('Corrected in EPO: EPO shows another person than ServiceNow, changed after the first message', () => {
  const { read } = setup();
  const systems = systemsById(read.systems);
  const people = { owned_by: { id: 'ann', name: 'Person ANN' } };
  const names = new Map([['dan', 'Person DAN']]);
  assert.deepEqual(correctedInEpo('owned_by', systems.get('e-1'), people, undefined, '2026-11-01T09:00:00', config, names), { on: '2026-11-05', value: 'System Owner Person DAN (dan)' });
  // The change in EPO came before the message: nothing to say.
  assert.equal(correctedInEpo('owned_by', systems.get('e-1'), people, undefined, '2026-11-06T09:00:00', config, names), null);
  // EPO has the same person as ServiceNow.
  assert.equal(correctedInEpo('managed_by', systems.get('e-1'), { managed_by: { id: 'bob', name: 'Bob' } }, undefined, '', config), null);
  // In the app: shown on an open case of a CI from EPO, with what follows.
  const { report, run } = setup();
  const index = peopleIndex([{ ...run, people: peopleOf(report.cis, report.cis.map((item) => item.key)) }]);
  const fact = { ...run.facts.filter((item) => item.checkId === 'EPO-DIFF')[0]!, route: 'epo' as const };
  const item = buildCases([{ ...run, facts: [fact] }], [], [], DATE, { reminderDays: 3, maxReminders: 2 })[0]!;
  const message = { id: 'm1', at: '2026-11-03T09:00:00', by: 'sam@example.com', byName: 'Sam', type: 'message' as const, keys: [item.key] };
  assert.match(epoCorrection({ ...item, messages: [message] }, systems, index, config), /^Corrected in EPO on 5 November 2026: EPO now has System Owner dan\. ServiceNow receives it from EPO/);
  // The message went out after the change in EPO: the person has not corrected anything since.
  assert.equal(epoCorrection({ ...item, messages: [{ ...message, at: '2026-11-07T09:00:00' }] }, systems, index, config), '');
  // Nobody was asked yet: the manager sees that EPO already has another person.
  assert.match(epoCorrection(item, systems, index, config), /^EPO already has System Owner dan \(last change in EPO: 5 November 2026\), so nobody needs to be asked\./);
  assert.equal(epoCorrection({ ...item, fact: { ...item.fact, route: '' } }, systems, index, config), '');
});

test('lifecycle review: the status in EPO, and the CIs that agree can be marked in one click', () => {
  const { read } = setup();
  const systems = systemsById(read.systems);
  const item = (ciKey: string, epoId: string, status: string) => ({ ciKey, name: ciKey, classLabel: 'Service Instance', className: 'service_instance', status, epoId, group: 'sample' as const });
  const review: Review = { kind: 'lifecycle', id: '2026-11-11_lifecycle', date: DATE, report: 'ci.csv', reportDate: DATE,
    items: [item('a', 'E-1', 'Operational'), item('b', 'E-4', 'Operational'), item('c', '', 'Operational'), item('d', 'E-2', 'Operational')] };
  assert.deepEqual(epoStatusOf(review.items[1]!, systems), { status: 'Retired', words: 'Nedlagt (Retired)' });
  assert.deepEqual(epoStatusOf(review.items[2]!, systems), { status: '', words: '' });
  const marks = new Map([['d', { result: 'same', note: '', by: 'x', byName: 'X', at: '2026-11-11T10:00:00' }]]);
  assert.deepEqual(agreeingWithEpo(review, marks, systems).map((found) => found.ciKey), ['a']);
  assert.deepEqual(agreeingWithEpo(review, marks, null), []);
});
