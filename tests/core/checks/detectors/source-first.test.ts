import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../../../src/core/reading/csv.ts';
import { buildCases, buildRun, stateOf } from '../../../../src/core/cases/cases.ts';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { SOURCE_FIRST } from '../../../../src/core/checks/detectors/source-first.ts';
import { epoConfig, readEpoReport } from '../../../../src/core/sources/epo/epo-report.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { buildDrafts } from '../../../../src/core/messages/messages.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import type { EpoInput } from '../../../../src/core/sources/epo/epo-report.ts';
import type { References } from '../../../../src/core/model/model.ts';

/* The source first (D190): the people lines of a Service Instance compared with EPO before anybody is asked. Invented data only. */

const packs = loadPacks();
const references = loadReferences();
const DATE = '2026-11-11';

const HEADER = ['name', 'sys_class_name', 'asset_tag', 'operational_status', 'ref_cmdb_ci_service.u_service_mapped']
  .concat(...['owned_by', 'managed_by', 'supported_by'].map((role) => [role, `${role}.user_name`, `${role}.email`, `${role}.active`])).join(',');
const EPO_HEADER = 'EPOID;SystemName;SystemDescription;SystemStatus;OwnerDepartment;Owner;Responsible1;Responsible2;AJOUR_TMS';

/** A person cell group: "ann" is active, "ann-" is inactive, '' is nobody. */
const person = (id: string): string[] => {
  const user = id.replace(/-$/, '');
  return user ? [`Person ${user.toUpperCase()}`, user, `${user}@example.com`, /-$/.test(id) ? 'false' : 'true'] : ['', '', '', ''];
};
const ci = (name: string, tag: string, mapped: boolean, owner: string, managed: string, supported: string, cls = 'Service Instance'): string =>
  [name, cls, tag, 'Operational', String(mapped), ...person(owner), ...person(managed), ...person(supported)].map((cell) => `"${cell}"`).join(',');
const system = (id: string, name: string, owner: string, first: string, second: string): string => `"${id}";"${name}";"";"Kørende";"D1";"${owner}";"${first}";"${second}";"01-06-2026 10:00:00"`;

const CIS = [
  // The owner is inactive, and EPO names the same person: EPO itself is wrong, the owner's side is asked.
  ci('Same - PROD', 'S-1', false, 'old-', 'bob', 'cat'),
  // Managed by is inactive, EPO already names another person. Service mapped: SACM copies it.
  ci('Mapped - PROD', 'S-2', true, 'ann', 'old-', 'cat'),
  // The same on a CI that is not service mapped: the sync has not brought it.
  ci('Synced - PROD', 'S-3', false, 'ann', 'old-', 'cat'),
  // Supported by is empty in both.
  ci('Empty - PROD', 'S-4', false, 'ann', 'bob', ''),
  // A leftover with an inactive person, and one with a person who is still active.
  ci('Leftover - PROD', 'S-5', false, 'ann', 'old-', 'cat'),
  ci('Kept - PROD', 'S-6', true, 'ann', 'bob', 'cat'),
  // The same person in both roles: EPO names two people on the first, the same person on the second.
  ci('Twice - PROD', 'S-7', false, 'ann', 'ann', 'cat'),
  ci('Twice Too - PROD', 'S-8', false, 'ann', 'ann', 'cat'),
  // EPO names another person who is inactive too.
  ci('Both Old - PROD', 'S-9', false, 'ann', 'old-', 'cat'),
  // No EPO system, and a class EPO does not hold a systems report for: unchanged.
  ci('Alone - PROD', '', false, 'ann', 'old-', 'cat'),
  ci('A Service', 'S-2', false, 'ann', 'old-', 'cat', 'Business Service'),
  ci('Gone - PROD', 'S-10', false, 'ann', 'gon-', 'cat')
];
const SYSTEMS = [
  system('S-1', 'Same', 'OLD', 'bob', 'cat'), system('S-2', 'Mapped', 'ann', 'bob', 'cat'), system('S-3', 'Synced', 'ann', 'bob', 'cat'),
  system('S-4', 'Empty', 'ann', 'bob', ''), system('S-5', 'Leftover', 'ann', '', 'cat'), system('S-6', 'Kept', 'ann', 'bob', ''),
  system('S-7', 'Twice', 'ann', 'bob', 'cat'), system('S-8', 'Twice Too', 'ann', 'ann', 'cat'), system('S-9', 'Both Old', 'ann', 'gon', 'cat'),
  system('S-10', 'Gone', 'ann', 'gon', 'cat')
];

function setup(options: { epo?: boolean; references?: References } = {}) {
  const report = readCiReport(parseCsv([HEADER].concat(CIS).join('\n')));
  const refs = options.references ?? references;
  const read = readEpoReport(parseCsv([EPO_HEADER].concat(SYSTEMS).join('\n')), epoConfig(refs)!);
  const epo: EpoInput | null = options.epo === false ? null : { systems: read.systems, date: DATE, report: 'epo.csv', previousDate: '' };
  const result = runChecks(report.cis, report.columns, packs, refs, { date: DATE, epo });
  return { result, run: buildRun(report.cis, result, packs, DATE, 'ci.csv', refs) };
}
const { result, run } = setup();
const fact = (check: string, name: string, field: string) => run.facts.filter((one) => one.checkId === check && one.ciName === name && one.field === field)[0];

test('EPO is wrong too: the owner is asked, and the line says what EPO holds', () => {
  const same = fact('RESP-INACTIVE', 'Same - PROD', 'owned_by')!;
  assert.equal(stateOf(same), 'open');
  assert.equal(same.detail, 'Owned by is an inactive user: Person OLD. EPO names the same person as System Owner');
  assert.equal(same.source, 'EPO names the same person as System Owner');
  assert.equal(same.route, 'epo');
  const empty = fact('SUPPORTED-BY', 'Empty - PROD', 'supported_by')!;
  assert.deepEqual([stateOf(empty), empty.source], ['open', 'Secondary Responsible is empty in EPO too']);
  // Another person in EPO who is known as inactive is no answer either.
  const both = fact('RESP-INACTIVE', 'Both Old - PROD', 'managed_by')!;
  assert.deepEqual([stateOf(both), both.source], ['open', 'EPO names Person GON (gon) as Primary Responsible, who is not active either']);
});

test('EPO already names another person: the line waits and nobody is asked; it says who brings the value', () => {
  const mapped = fact('RESP-INACTIVE', 'Mapped - PROD', 'managed_by')!;
  assert.equal(stateOf(mapped), 'waiting');
  assert.equal(mapped.stateWhy, 'EPO already names Person BOB (bob) as Primary Responsible: SACM copies it into ServiceNow (card "EPO ≠ ServiceNow")');
  assert.equal(mapped.source, undefined);
  const synced = fact('RESP-INACTIVE', 'Synced - PROD', 'managed_by')!;
  assert.equal(synced.stateWhy, 'EPO already names Person BOB (bob) as Primary Responsible: the sync has not brought it yet (card "EPO update not arrived")');
  // The difference itself is on the EPO card of the CI.
  assert.equal(run.facts.some((one) => one.checkId === 'EPO-DIFF' && one.ciName === 'Mapped - PROD' && one.field === 'managed_by'), true);
  assert.equal(run.facts.some((one) => one.checkId === 'EPO-NOT-ARRIVED' && one.ciName === 'Synced - PROD' && one.field === 'managed_by'), true);
  // A waiting line is never in a message.
  const cases = buildCases([run], [], [], DATE, { reminderDays: 3, maxReminders: 2 }).filter((item) => item.state === 'open');
  assert.equal(cases.some((item) => item.fact.ciName === 'Mapped - PROD' && item.fact.checkId === 'RESP-INACTIVE'), false);
});

test('a leftover: the owner fills the role in EPO, the line is not on the EPO cards, and an active old person gets a line too', () => {
  const old = fact('RESP-INACTIVE', 'Leftover - PROD', 'managed_by')!;
  assert.equal(stateOf(old), 'open');
  assert.equal(old.source, 'Primary Responsible is empty in EPO; ServiceNow still shows the old person, because the sync never clears a field');
  // No second line for the same role on the card for an empty role.
  assert.equal(fact('RESP-MISSING', 'Leftover - PROD', 'managed_by'), undefined);
  const kept = fact('SUPPORTED-BY', 'Kept - PROD', 'supported_by')!;
  assert.equal(kept.detail, 'Supported by is empty in EPO (Secondary Responsible); ServiceNow still shows Person CAT (cat), because the sync never clears a field');
  assert.deepEqual([stateOf(kept), kept.route, kept.contactVia], ['open', 'epo', 'managed by']);
  assert.equal(run.facts.some((one) => /^EPO-/.test(one.checkId) && /Leftover|Kept/.test(one.ciName)), false);
  assert.equal(new Set(result.findings.map((finding) => finding.key)).size, result.findings.length);
});

test('Owner = Manager: EPO names two people, the line waits; EPO names the same person twice, the owner is asked', () => {
  const two = fact('RESP-SAME-PERSON', 'Twice - PROD', 'owned_by')!;
  assert.equal(stateOf(two), 'waiting');
  assert.match(two.stateWhy ?? '', /^EPO already names two people \(System Owner Person ANN \(ann\), Primary Responsible Person BOB \(bob\)\): the sync has not brought it yet/);
  const same = fact('RESP-SAME-PERSON', 'Twice Too - PROD', 'owned_by')!;
  assert.deepEqual([stateOf(same), same.source], ['open', 'EPO names the same person as System Owner and Primary Responsible']);
});

test('what is not compared stays as it was: no EPO system, another class, another check', () => {
  const alone = fact('RESP-INACTIVE', 'Alone - PROD', 'managed_by')!;
  assert.deepEqual([stateOf(alone), alone.source, alone.detail], ['open', undefined, 'Managed by is an inactive user: Person OLD']);
  const service = fact('RESP-INACTIVE', 'A Service', 'managed_by')!;
  assert.deepEqual([stateOf(service), service.source], ['open', undefined]);
});

test('the message shows what EPO holds in the column "What we found"', () => {
  const cases = buildCases([run], [], [], DATE, { reminderDays: 3, maxReminders: 2 }).filter((item) => item.fact.ciName === 'Empty - PROD' && item.fact.checkId === 'SUPPORTED-BY');
  let count = 0;
  const { drafts } = buildDrafts(cases, packs, { portalLink: '', signature: 'SACM team', requests: {}, channel: 'email' } as never, () => `SACM-T${++count}`);
  assert.equal(drafts.length, 1);
  assert.match(drafts[0]!.body, /<th align="left" style="white-space:nowrap">What we found<\/th>/);
  assert.match(drafts[0]!.plain, /Supported by is empty\. Secondary Responsible is empty in EPO too/);
  assert.match(drafts[0]!.plain, /These CIs come from EPO\./);
});

test('without an EPO systems report the lines stay as they are, and the run says so', () => {
  const none = setup({ epo: false });
  const line = none.run.facts.filter((one) => one.checkId === 'RESP-INACTIVE' && one.ciName === 'Mapped - PROD')[0]!;
  assert.deepEqual([stateOf(line), line.source], ['open', undefined]);
  const note = none.result.notes.filter((one) => one.checkId === SOURCE_FIRST)[0]!;
  assert.match(note.note, /^\d+ people lines of CIs from EPO were not compared with EPO first: no EPO systems report is loaded\. Load it with the CI report\.$/);
  assert.equal(result.notes.some((one) => one.checkId === SOURCE_FIRST), false);
});

test('the rule is data: without "sourceFirst" in the reference file nothing is compared, and a leftover is on the EPO card again', () => {
  const config = { ...(references['reference/epo-systems-report'] as Record<string, unknown>) };
  delete config['sourceFirst'];
  const plain = setup({ references: { ...references, 'reference/epo-systems-report': config } });
  assert.equal(plain.run.facts.some((one) => !!one.source), false);
  assert.equal(plain.run.facts.some((one) => one.checkId === 'EPO-NOT-ARRIVED' && one.ciName === 'Leftover - PROD' && one.field === 'managed_by'), true);
});
