import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksInUse, runChecks } from '../../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../../src/core/sources/relationships/relationship-report.ts';
import { REVIEWED_ASK, REVIEWED_BACK, buildCases, buildRun } from '../../../../src/core/cases/cases.ts';
import { buildGraph, environmentOf } from '../../../../src/core/checks/detectors/relationship-detectors.ts';
import { buildDrafts } from '../../../../src/core/messages/messages.ts';
import { cardSummaries, cardTotals } from '../../../../src/app/view/cards.ts';
import { exportFixCsv } from '../../../../src/app/view/exports.ts';
import { askable, fixRows, handedToOwner, isFixList } from '../../../../src/app/view/fix-list.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import { asLive } from '../../../helpers.ts';
import type { CaseEvent } from '../../../../src/core/cases/cases.ts';
import type { RelationshipModel } from '../../../../src/core/checks/detectors/relationship-detectors.ts';

/* Invented data only. Each CI row: name, class, status, owner, manager, tags, platform, environment, parent field. */

const packs = asLive(loadPacks());
const references = loadReferences();
const model = references['reference/relationship-model'] as RelationshipModel;
const rules = { reminderDays: 3, maxReminders: 2 };
const ZWSP = '​';

const HEAD = ['name', 'sys_class_name', 'asset_tag', 'operational_status', 'owned_by', 'owned_by.user_name', 'owned_by.email', 'managed_by', 'managed_by.user_name', 'managed_by.email', 'sys_tags', 'ref_cmdb_ci_service.u_platform', 'environment', 'ref_cmdb_ci_service.u_service_mapped'];
type Row = [string, string, string?, string?, string?, string?, string?, string?];

function ciCsv(rows: Row[], parent?: Record<string, string>, createdBy?: Record<string, string>): string[][] {
  const head = HEAD.concat(parent ? ['ref_cmdb_ci_service.parent'] : [], createdBy ? ['sys_created_by'] : []);
  const person = (who: string): string[] => (who ? [who, who.toLowerCase().replace(/\s+/g, '.'), `${who.toLowerCase().replace(/\s+/g, '.')}@example.com`] : ['', '', '']);
  return [head].concat(rows.map(([name, className, status = 'Operational', owner = 'Ann Owner', manager = 'Max Manager', tags = '', platform = 'false', environment = '']) => {
    const cells = [name, className, '', status, ...person(owner), ...person(manager), tags, platform, environment, 'false'];
    return cells.concat(parent ? [parent[name] ?? ''] : [], createdBy ? [createdBy[name] ?? 'abc'] : []);
  }));
}

/** Relationship rows: parent, type, child, and the two classes when the test needs them (a name two CIs share). */
type Rel = [string, string, string] | [string, string, string, string, string];
function relRows(rows: Rel[]): string[][] {
  return [['Parent', 'Type', 'Child', 'Class', 'Class']].concat(rows.map((row) => [row[0], row[1], row[2], row[3] ?? '', row[4] ?? '']));
}

/** A small, healthy CMDB: every rule of the model is met. */
const HEALTHY: Row[] = [
  ['Pay', 'Business Capability'],
  ['Pay a fine', 'Business Process'],
  ['Fines_BA', 'Business Application'],
  ['Fines - PROD', 'Service Instance'],
  ['Fines - TEST', 'Service Instance'],
  ['Fines_BS', 'Business Service'],
  ['Fines - Standard', 'Service Offering']
];
const HEALTHY_RELS: Array<[string, string, string]> = [
  ['Pay', 'Provided by::Provides', 'Pay a fine'],
  ['Pay a fine', 'Provided By::Provides', 'Fines_BA'],
  ['Pay a fine', 'Provided by::Provides', 'Fines_BS'],
  ['Fines_BA', 'Consumes::Consumed by', 'Fines - PROD'],
  ['Fines_BA', 'Consumes::Consumed by', 'Fines - TEST'],
  ['Fines_BS', 'Provides::Provided by', 'Fines - Standard'],
  ['Fines - Standard', 'Depends on::Used by', 'Fines - PROD']
];

function check(rows: Row[], rels: Rel[] | null, parent?: Record<string, string>, options: { createdBy?: Record<string, string>; packs?: typeof packs } = {}) {
  const report = readCiReport(ciCsv(rows, parent, options.createdBy));
  const relationships = rels ? readRelationshipReport(relRows(rels)).relationships : null;
  const used = options.packs ?? packs;
  const result = runChecks(report.cis, report.columns, used, references, { relationships });
  const run = buildRun(report.cis, result, used, '2026-11-12', 'cmdb_ci.csv', references);
  const of = (checkId: string) => run.facts.filter((fact) => fact.checkId === checkId);
  return { report, result, run, of };
}

test('a healthy CMDB gives no relationship finding, and every relationship check is tested', () => {
  const { result, of } = check(HEALTHY, HEALTHY_RELS);
  for (const id of ['REL-MISSING', 'REL-ONE-TO-ONE', 'REL-WRONG-TYPE', 'REL-TWICE', 'APP-INSTANCE-MATCH', 'OFFERING-OWNER']) {
    assert.deepEqual(of(id).map((fact) => fact.detail), [], id);
    assert.ok(result.tested.some((entry) => entry.startsWith(`${id}:`)), `${id} tested`);
  }
  // Without the Parent column, only "Offering parent" stays untested, and says why.
  assert.ok(!result.tested.some((entry) => entry.startsWith('OFFERING-PARENT:')));
  assert.match(result.notes.filter((note) => note.checkId === 'OFFERING-PARENT')[0]!.note, /no Parent column/);
});

test('without a Relationship report every relationship check is grey, with a note', () => {
  const { result } = check(HEALTHY, null);
  for (const pack of checksInUse(packs).filter((candidate) => candidate.family === 'relationships')) {
    assert.ok(!result.tested.some((entry) => entry.startsWith(`${pack.id}:`)), pack.id);
    assert.match(result.notes.filter((note) => note.checkId === pack.id)[0]!.note, /no Relationship report/, pack.id);
  }
});

test('relationship missing: a relationship to a Retired CI does not count', () => {
  const rows = HEALTHY.concat([['Old Pay', 'Business Process', 'Retired'], ['Pay later_BA', 'Business Application']]);
  const { of } = check(rows, HEALTHY_RELS.concat([['Old Pay', 'Provided by::Provides', 'Pay later_BA']]));
  // An application without a process is a case of the mapping backlog (D200).
  assert.ok(of('MAPPING').some((fact) => fact.ciName === 'Pay later_BA' && (fact.mapping ?? []).indexOf('ba-business-process') >= 0));
  // "No capability above a process" is parked with the capabilities (D179).
  const lonely = check(HEALTHY.concat([['Pay later', 'Business Process']]), HEALTHY_RELS.concat([['Pay later', 'Provided by::Provides', 'Fines_BA']]));
  assert.ok(!lonely.of('REL-MISSING').some((fact) => fact.field === 'bp-business-capability'));
});

test('relationship missing and the mapping backlog: states, review rules and the EPO route', () => {
  const rows = HEALTHY.concat([
    ['Lonely - PROD', 'Service Instance'],
    ['Planned - PROD', 'Service Instance', 'Operational', 'Ann Owner', 'Max Manager', 'To Be Mapped'],
    ['Descoped - PROD', 'Service Instance', 'Operational', 'Ann Owner', 'Max Manager', 'Descoped'],
    ['New - PROD', 'Service Instance', 'Ready'],
    ['Bare offering', 'Service Offering']
  ]);
  const { of } = check(rows, HEALTHY_RELS.concat([['Fines_BS', 'Provides::Provided by', 'Bare offering']]));
  const by = (name: string) => of('REL-MISSING').filter((fact) => fact.ciName === name).map((fact) => `${fact.field} ${fact.state}`);
  const mapping = (name: string) => of('MAPPING').filter((fact) => fact.ciName === name).map((fact) => `${(fact.mapping ?? []).join('+')} ${fact.state}`);
  // A Service Instance without a Business Application is a case of the mapping backlog (D200), not on Relationship missing.
  assert.deepEqual(by('Lonely - PROD'), []);
  assert.deepEqual(mapping('Lonely - PROD'), ['si-business-application open']);
  assert.deepEqual(mapping('Planned - PROD'), ['si-business-application known']);
  assert.deepEqual(mapping('Descoped - PROD'), ['si-business-application known']);
  assert.deepEqual(mapping('New - PROD'), ['si-business-application waiting']);
  // An offering without a Service Instance is only listed for a review: the rule is not agreed.
  assert.deepEqual(by('Bare offering'), ['bso-service-instance review']);
  // A Service Instance without a Business Application is mapped by SACM in ServiceNow with the owner (D139): never "correct it in EPO".
  const lonely = of('MAPPING').filter((fact) => fact.ciName === 'Lonely - PROD')[0]!;
  assert.equal(lonely.route, '');
  assert.equal(lonely.inServiceNow, true);
  // A Business Service still comes from EPO: its missing offering is added there.
  const service = check(HEALTHY.concat([['Empty_BS', 'Business Service']]), HEALTHY_RELS.concat([['Pay a fine', 'Provided by::Provides', 'Empty_BS']])).of('REL-MISSING').filter((fact) => fact.ciName === 'Empty_BS');
  assert.deepEqual(service.map((fact) => [fact.field, fact.route]), [['bs-offering', 'epo']]);
  const cases = buildCases([check(rows, HEALTHY_RELS).run], [], [], '2026-11-12', rules).filter((item) => item.fact.ciName === 'Lonely - PROD' && item.fact.checkId === 'MAPPING');
  const { drafts } = buildDrafts(cases, packs, { portalLink: '', signature: 'SACM team' }, () => 'SACM-T1');
  // The invitation: a mapping session, no list of questions (D202).
  assert.match(drafts[0]!.plain, /Could we plan a 30-minute mapping session with you\?/);
  assert.doesNotMatch(drafts[0]!.plain, /EPO\./);
  assert.doesNotMatch(drafts[0]!.plain, /which Business Process does your system deliver/i);
});

test('relationship missing: a Business Capability needs a Business Process or a Business Capability below it (D140)', () => {
  const rows = HEALTHY.concat([['Host', 'Business Capability'], ['Read', 'Business Capability'], ['Read more', 'Business Capability']]);
  const { of } = check(rows, HEALTHY_RELS.concat([['Read', 'Provided by::Provides', 'Read more'], ['Read more', 'Provided by::Provides', 'Pay a fine']]));
  assert.deepEqual(of('REL-MISSING').map((fact) => `${fact.ciName}: ${fact.field} ${fact.state}`), ['Host: bc-below open']);
  assert.equal(of('REL-MISSING')[0]!.detail, 'Business Capability with nothing below');
  const cases = buildCases([check(rows, HEALTHY_RELS).run], [], [], '2026-11-12', rules).filter((item) => item.fact.field === 'bc-below' && item.fact.ciName === 'Host');
  const { drafts } = buildDrafts(cases, packs, { portalLink: '', signature: 'SACM team' }, () => 'SACM-T1');
  assert.match(drafts[0]!.plain, /Which Business Processes or Business Capabilities carry out this capability\?/);
});

test('too many partners: an offering with two services, a Business Application per environment, a Platform', () => {
  const rows = HEALTHY.concat([
    ['Cards_BS', 'Business Service'],
    ['Fines - PROD2', 'Service Instance', 'Operational', 'Ann Owner', 'Max Manager', '', 'false', 'Production'],
    ['Fines Data', 'Service Instance', 'Operational', 'Ann Owner', 'Max Manager', '', 'true'],
    ['Data_BA', 'Business Application'],
    ['Other_BA', 'Business Application']
  ]);
  const rels = HEALTHY_RELS.concat([
    ['Cards_BS', 'Provides::Provided by', 'Fines - Standard'],
    ['Pay a fine', 'Provided by::Provides', 'Cards_BS'],
    // A second production instance (Environment field) for one Business Application; TEST is another environment.
    ['Fines_BA', 'Consumes::Consumed by', 'Fines - PROD2'],
    // A Platform: one Business Application only.
    ['Data_BA', 'Consumes::Consumed by', 'Fines Data'],
    ['Other_BA', 'Consumes::Consumed by', 'Fines Data'],
    ['Pay a fine', 'Provided by::Provides', 'Data_BA'],
    ['Pay a fine', 'Provided by::Provides', 'Other_BA']
  ]);
  const { of, run } = check(rows, rels);
  assert.deepEqual(of('REL-ONE-TO-ONE').map((fact) => `${fact.ciName}: ${fact.detail}`).sort(), [
    'Fines - Standard: Service Offering with more than one Business Service: Cards_BS, Fines_BS',
    'Fines Data: Service Instance with more than one Business Application: Data_BA, Other_BA',
    'Fines_BA: Business Application with more than one Service Instance in one environment: PROD: Fines - PROD, Fines - PROD2'
  ]);
  // A SACM fix list (D138): all to solve, never "remove it in EPO"; the owner is known, but asked only when SACM cannot tell.
  const pack = packs.filter((candidate) => candidate.id === 'REL-ONE-TO-ONE')[0]!;
  assert.ok(isFixList(pack));
  const offering = of('REL-ONE-TO-ONE').filter((fact) => fact.ciName === 'Fines - Standard')[0]!;
  assert.equal(offering.state, 'open');
  assert.equal(offering.route, '');
  assert.deepEqual(offering.fix, { change: 'Service Offering with more than one Business Service: keep the right one, remove the other relationships', current: 'Cards_BS, Fines_BS', set: 'Keep only the right one' });
  assert.equal(offering.contactEmail, 'ann.owner@example.com');
  const ask: CaseEvent = { id: 'e1', at: '2026-11-12T10:00:00Z', by: 'ana@example.com', byName: 'Ana', type: 'reviewed', keys: [offering.key], text: REVIEWED_ASK };
  const before = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.key === offering.key)[0]!;
  assert.equal(handedToOwner(pack, before), false);
  assert.equal(askable(pack, before), false);
  const handed = buildCases([run], [ask], [], '2026-11-12', rules).filter((item) => item.key === offering.key)[0]!;
  assert.equal(handed.state, 'open');
  assert.equal(handedToOwner(pack, handed), true);
  // The card: off the fix list, in the owner groups; the message asks which one is right and says SACM removes the others in ServiceNow.
  const card = cardSummaries(packs, run, [handed], new Map()).filter((entry) => entry.id === 'REL-ONE-TO-ONE')[0]!;
  assert.equal(card.light, 'red');
  const { drafts } = buildDrafts([handed], packs, { portalLink: '', signature: 'SACM team' }, () => 'SACM-T1');
  assert.match(drafts[0]!.plain, /Which one is right\? Reply to this email, and SACM removes the other relationships in ServiceNow\./);
  assert.doesNotMatch(drafts[0]!.plain, /in EPO/);
  const back: CaseEvent = { ...ask, id: 'e2', at: '2026-11-12T11:00:00Z', text: REVIEWED_BACK };
  assert.equal(handedToOwner(pack, buildCases([run], [ask, back], [], '2026-11-12', rules).filter((item) => item.key === offering.key)[0]!), false);
});

test('environment: the Environment field, else a trailing word of the name, else production', () => {
  assert.equal(environmentOf('Fines - TEST', '', model), 'TEST');
  assert.equal(environmentOf('Fines', 'Acceptance', model), 'ACC');
  assert.equal(environmentOf('Fines', '', model), 'PROD');
});

test('wrong type: a type of another pair, a pair not allowed, a Platform above its user (review)', () => {
  const rows = HEALTHY.concat([['Shared Data', 'Service Instance', 'Operational', 'Ann Owner', 'Max Manager', '', 'true'], ['Data_BA', 'Business Application']]);
  const rels = HEALTHY_RELS.map((rel): [string, string, string] => (rel[0] === 'Pay a fine' && rel[2] === 'Fines_BA' ? ['Pay a fine', 'Depends on::Used by', 'Fines_BA'] : rel)).concat([
    ['Fines_BA', 'Provided by::Provides', 'Fines_BS'],
    ['Shared Data', 'Depends on::Used by', 'Fines - PROD'],
    ['Data_BA', 'Consumes::Consumed by', 'Shared Data']
  ]);
  const { of } = check(rows, rels);
  const found = of('REL-WRONG-TYPE');
  assert.deepEqual(found.map((fact) => `${fact.field} ${fact.state}`).sort(), ['direction review', 'pair open', 'type open']);
  const type = found.filter((fact) => fact.field === 'type')[0]!;
  assert.deepEqual(type.fix, { change: 'Type of Pay a fine → Fines_BA', current: 'Depends on::Used by', set: 'Provided by::Provides', value: 'Provided by::Provides', relatedTo: 'Fines_BA' });
  assert.ok(isFixList(packs.filter((pack) => pack.id === 'REL-WRONG-TYPE')[0]));
});

test('two CIs with one name: class first, then the live one; hidden characters are matched without them', () => {
  const rows = HEALTHY.concat([
    ['Pay', 'Business Process'],
    [`Hid${ZWSP}den_BA`, 'Business Application'],
    ['Hidden - PROD', 'Service Instance'],
    ['Twin_BA', 'Business Application', 'Retired'],
    ['Twin_BA', 'Business Application'],
    ['Twin - PROD', 'Service Instance']
  ]);
  const rels: Rel[] = (HEALTHY_RELS as Rel[]).concat([
    ['Pay', 'Provided by::Provides', 'Pay', 'Business Capability', 'Business Process'],
    ['Pay', 'Provided by::Provides', 'Fines_BA', 'Business Process', 'Business Application'],
    ['Pay a fine', 'Provided by::Provides', 'Hidden_BA'],
    ['Hidden_BA', 'Consumes::Consumed by', 'Hidden - PROD'],
    ['Pay a fine', 'Provided by::Provides', 'Twin_BA'],
    ['Twin_BA', 'Consumes::Consumed by', 'Twin - PROD']
  ]);
  const { of, report } = check(rows, rels);
  const graph = buildGraph(report.cis, readRelationshipReport(relRows(rels)).relationships, model);
  assert.equal(graph.unmatched, 0);
  const missing = of('REL-MISSING').map((fact) => `${fact.ciName}: ${fact.field}`);
  // "Pay" the process has its capability "Pay" (same name, other class): matched by class.
  assert.ok(!missing.some((line) => line.startsWith('Pay:')), missing.join('; '));
  assert.ok(!missing.some((line) => /Hid.den_BA|Hidden - PROD|Twin/.test(line)), missing.join('; '));
});

/** REL-RETIRED is switched off (D141): these tests run its detector with the status set back to live. */
const withRetiredCard = packs.map((pack) => (pack.id === 'REL-RETIRED' ? { ...pack, status: 'live' } : pack));

test('relationship to a Retired CI is switched off: not run, no card, no note (D141)', () => {
  const rows = HEALTHY.concat([['Old - PROD', 'Service Instance', 'Retired']]);
  const { of, result, run } = check(rows, HEALTHY_RELS.concat([['Fines - PROD', 'Depends on::Used by', 'Old - PROD']]));
  assert.equal(of('REL-RETIRED').length, 0);
  assert.ok(!result.tested.some((entry) => entry.startsWith('REL-RETIRED:')));
  assert.ok(!result.notes.some((note) => note.checkId === 'REL-RETIRED'));
  assert.ok(!cardSummaries(packs, run, [], new Map()).some((card) => card.id === 'REL-RETIRED'));
  assert.equal(packs.filter((pack) => pack.id === 'REL-RETIRED')[0]!.status, 'off');
});

test('relationship to a Retired CI (when switched on): on the live CI, once, with a fix line', () => {
  const rows = HEALTHY.concat([['Old - PROD', 'Service Instance', 'Retired'], ['Gone', 'Business Capability', 'Retired'], ['Gone child', 'Business Capability', 'Retired']]);
  const rels = HEALTHY_RELS.concat([
    ['Fines - PROD', 'Depends on::Used by', 'Old - PROD'],
    ['Fines - PROD', 'Depends on::Used by', 'Old - PROD'],
    ['Gone', 'Provided by::Provides', 'Gone child']
  ]);
  const { of } = check(rows, rels, undefined, { packs: withRetiredCard });
  const found = of('REL-RETIRED');
  assert.equal(found.length, 1);
  assert.equal(found[0]!.ciName, 'Fines - PROD');
  assert.equal(found[0]!.state, 'open');
  assert.match(found[0]!.detail, /Retired Service Instance Old - PROD \(child, Depends on::Used by\)/);
  // Two Retired ends: nothing to fix. A relationship entered twice with a Retired end is not listed twice.
  assert.equal(of('REL-TWICE').length, 0);
});

test('relationship entered twice: only one relationship is allowed between two CIs, whatever its type or direction', () => {
  const rels = HEALTHY_RELS.concat([
    ['Fines_BS', 'Provides::Provided by', 'Fines - Standard'],
    ['Pay a fine', 'Depends on::Used by', 'Fines_BA'],
    ['Fines - PROD', 'Depends on::Used by', 'Fines - Standard']
  ]);
  const { of } = check(HEALTHY, rels);
  assert.deepEqual(of('REL-TWICE').map((fact) => fact.detail).sort(), [
    '2 relationships between Fines - Standard and Fines - PROD: Fines - Standard Depends on::Used by Fines - PROD; Fines - PROD Depends on::Used by Fines - Standard',
    '2 relationships between Pay a fine and Fines_BA: Pay a fine Provided By::Provides Fines_BA; Pay a fine Depends on::Used by Fines_BA',
    'Entered 2 times: Fines_BS Provides::Provided by Fines - Standard'
  ]);
  assert.ok(of('REL-TWICE').every((fact) => fact.fix && fact.contactEmail === ''));
});

test('application ≠ instance: the instance whose name it carries, production first; a fix line per field', () => {
  const rows: Row[] = HEALTHY.map((row): Row => (row[0] === 'Fines_BA' ? ['Fines_BA', 'Business Application', 'Operational', 'Ann Owner', 'Old Manager'] : row));
  rows.push(['Fines - TEST', 'Service Instance', 'Operational', 'Other Owner', 'Other Manager']);
  const { of } = check(rows.filter((row, index) => !(row[0] === 'Fines - TEST' && index < rows.length - 1)), HEALTHY_RELS);
  const found = of('APP-INSTANCE-MATCH');
  assert.deepEqual(found.map((fact) => fact.field), ['managed_by']);
  assert.deepEqual(found[0]!.fix, { change: 'Set Managed by (as on Fines - PROD)', current: 'Old Manager', set: 'Max Manager', value: 'Max Manager' });
  // SACM fixes it itself: it does not wait, and nobody is asked.
  assert.equal(found[0]!.contactEmail, '');
});

test('offering owner ≠ service owner, and the Parent field of an offering', () => {
  const rows: Row[] = HEALTHY.map((row): Row => (row[0] === 'Fines - Standard' ? ['Fines - Standard', 'Service Offering', 'Operational', 'Other Owner'] : row));
  rows.push(['Cards - Standard', 'Service Offering'], ['Cards_BS', 'Business Service']);
  const rels = HEALTHY_RELS.concat([['Cards_BS', 'Provides::Provided by', 'Cards - Standard'], ['Pay a fine', 'Provided by::Provides', 'Cards_BS']]);
  const { of, result } = check(rows, rels, { 'Fines - Standard': 'Fines_BS', 'Cards - Standard': 'Fines_BS' });
  assert.deepEqual(of('OFFERING-OWNER').map((fact) => fact.detail), ['Owned by is Other Owner; its Business Service Fines_BS is owned by Ann Owner']);
  // A SACM fix list (D137): SACM copies the owner of the Business Service; nobody is asked, and it does not wait on Ready.
  assert.deepEqual(of('OFFERING-OWNER')[0]!.fix, { change: 'Owned by (as on Fines_BS)', current: 'Other Owner', set: 'Ann Owner', value: 'Ann Owner' });
  assert.equal(of('OFFERING-OWNER')[0]!.contactEmail, '');
  assert.ok(isFixList(packs.filter((pack) => pack.id === 'OFFERING-OWNER')[0]));
  // An offering the EPO integration created (Created by is not a person's user ID) takes its owner from EPO: not raised.
  const fromEpo = check(rows, rels, undefined, { createdBy: { 'Fines - Standard': 'epo.integration' } });
  assert.deepEqual(fromEpo.of('OFFERING-OWNER'), []);
  assert.match(fromEpo.result.notes.filter((note) => note.checkId === 'OFFERING-OWNER')[0]!.note, /1 Service Offering comes from EPO/);
  assert.equal(check(rows, rels, undefined, { createdBy: { 'Fines - Standard': 'ab1' } }).of('OFFERING-OWNER').length, 1);
  assert.ok(result.tested.indexOf('OFFERING-PARENT:parent') >= 0);
  assert.deepEqual(of('OFFERING-PARENT').map((fact) => `${fact.ciName}: ${fact.detail}`), ['Cards - Standard: The Parent field names Fines_BS; the relationship names Cards_BS']);
  assert.deepEqual(of('OFFERING-PARENT')[0]!.fix, { change: 'Business Service of Cards - Standard: check which is right', current: 'Relationship: Cards_BS', set: 'Parent field: Fines_BS' });
});

test('offering parent: SACM fixes it; an offering whose Parent field names a service is not on Relationship missing', () => {
  const rows: Row[] = HEALTHY.concat([['Rooms - Standard', 'Service Offering'], ['Rooms - Gold', 'Service Offering'], ['Fines - Gold', 'Service Offering']]);
  const rels = HEALTHY_RELS.concat([['Fines_BS', 'Provides::Provided by', 'Fines - Gold'], ['Fines - Gold', 'Depends on::Used by', 'Fines - PROD'], ['Rooms - Standard', 'Depends on::Used by', 'Fines - PROD'], ['Rooms - Gold', 'Depends on::Used by', 'Fines - PROD']]);
  const { of } = check(rows, rels, { 'Fines - Standard': 'Fines_BS', 'Rooms - Standard': 'Fines_BS' });
  // Parent set, no relationship: only on the SACM fix list.
  assert.ok(!of('REL-MISSING').some((fact) => fact.ciName === 'Rooms - Standard'));
  // Neither the field nor the relationship: still on Relationship missing.
  assert.ok(of('REL-MISSING').some((fact) => fact.ciName === 'Rooms - Gold'));
  const found = of('OFFERING-PARENT');
  assert.deepEqual(found.map((fact) => [fact.ciName, fact.fix]), [
    ['Rooms - Standard', { change: 'Add the relationship Fines_BS Provides::Provided by Rooms - Standard', current: 'No Business Service related', set: 'Fines_BS', value: 'Fines_BS' }],
    ['Fines - Gold', { change: 'Set the Parent field of Fines - Gold', current: '(empty)', set: 'Fines_BS', value: 'Fines_BS' }]
  ]);
  // Nobody is asked: SACM fixes it.
  assert.ok(found.every((fact) => fact.contactEmail === ''));
});

test('fix list: export, mark as fixed, then Verified only by a later report', () => {
  const rows = HEALTHY.concat([['Old - PROD', 'Service Instance', 'Retired']]);
  const first = check(rows, HEALTHY_RELS.concat([['Fines - PROD', 'Depends on::Used by', 'Old - PROD']]), undefined, { packs: withRetiredCard }).run;
  const key = first.facts.filter((fact) => fact.checkId === 'REL-RETIRED')[0]!.key;
  const fixed: CaseEvent = { id: 'e1', at: '2026-11-12T10:15:00Z', by: 'ana@example.com', byName: 'Ana', type: 'status', keys: [key], text: 'Fixed' };
  const cases = buildCases([first], [fixed], [], '2026-11-12', rules);
  const item = cases.filter((entry) => entry.key === key)[0]!;
  assert.equal(item.status, 'Fixed');
  const rowsOfList = fixRows([item]);
  assert.deepEqual(rowsOfList[0]!.fixed, { byName: 'Ana', at: '2026-11-12T10:15:00Z' });
  const csv = exportFixCsv([item]);
  assert.ok(csv.startsWith('﻿"Name","EPO ID","Class","Change","Current value","Value to set","Note","Status","Marked fixed by","Marked fixed on"'));
  assert.match(csv, /"Remove the relationship Fines - PROD Depends on::Used by Old - PROD","Old - PROD is Retired","Remove the relationship","","Fixed","Ana","2026-11-12 10:15"/);
  // Every line is marked: the card waits for the next report (D168). It still counts as to solve (D59).
  const card = cardSummaries(withRetiredCard, first, cases, new Map()).filter((entry) => entry.id === 'REL-RETIRED')[0]!;
  assert.equal(card.light, 'marked');
  assert.equal(card.open.length, 1);
  assert.deepEqual(cardTotals([card]), { redCards: 1, findings: 1, laterCards: 0, laterFindings: 0, greyCards: 0, waiting: 0, known: 0, review: 0 });
  const later = check(rows, HEALTHY_RELS, undefined, { packs: withRetiredCard }).run;
  later.date = '2026-11-13';
  const after = buildCases([first, later], [fixed], [], '2026-11-13', rules).filter((entry) => entry.key === key)[0]!;
  assert.equal(after.status, 'Verified');
});

test('mapping backlog message: one invitation to a mapping session for several CIs, no list of questions (D202)', () => {
  const rows = HEALTHY.concat([['Lone A', 'Business Process'], ['Lone B', 'Business Process'], ['Lone C', 'Business Process']]);
  const rels = HEALTHY_RELS.concat([['Pay', 'Provided by::Provides', 'Lone A'], ['Pay', 'Provided by::Provides', 'Lone B'], ['Pay', 'Provided by::Provides', 'Lone C']]);
  const { run } = check(rows, rels);
  assert.equal(buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'REL-MISSING' && item.state === 'open').length, 0);
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'MAPPING' && item.state === 'open');
  assert.equal(cases.length, 3);
  let n = 0;
  const { drafts } = buildDrafts(cases, packs, { portalLink: '', signature: 'SACM team' }, () => `SACM-T${++n}`);
  assert.equal(drafts.length, 1);
  assert.doesNotMatch(drafts[0]!.plain, /Which Business Process does your system deliver\?/i);
  assert.match(drafts[0]!.plain, /30-minute mapping session/);
  assert.match(drafts[0]!.subject, /^Mapping session on 3 CIs/);
});
