import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../../../src/core/reading/csv.ts';
import { withTeamDays } from '../../../../src/core/checks/detectors/ci-detectors.ts';
import { buildRun, stateOf } from '../../../../src/core/cases/cases.ts';
import { daysBetween, reportDate } from '../../../../src/core/shared/dates.ts';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';

/* The checks that read only the CI report, on invented data only. */

const packs = loadPacks();
const references = loadReferences();
const HEADER = 'name,sys_class_name,asset_tag,operational_status,owned_by,owned_by.email,support_group,support_group.active,sys_created_on,sys_updated_on,ref_cmdb_ci_service.parent';
const DATE = '2026-11-11';

/** Rows as: name, class, EPO ID, status, Support group, group active, created, updated, parent. Every CI has the same owner. */
function check(rows: string[][], options: { header?: string; date?: string; refs?: typeof references } = {}) {
  const lines = rows.map(([name, cls, tag, status, group, active, created, updated, parent]) =>
    [name, cls, tag, status, 'Ada Example', 'ada@example.com', group, active, created, updated, parent].map((cell) => `"${cell ?? ''}"`).join(','));
  let csv = [HEADER].concat(lines).join('\n');
  if (options.header) {
    const drop = HEADER.split(',').indexOf(options.header);
    csv = parseCsv(csv).map((cells) => cells.filter((_, at) => at !== drop).map((cell) => `"${cell}"`).join(',')).join('\n');
  }
  const report = readCiReport(parseCsv(csv));
  const refs = options.refs ?? references;
  const result = runChecks(report.cis, report.columns, packs, refs, { date: options.date ?? DATE });
  const run = buildRun(report.cis, result, packs, DATE, 'test.csv', refs);
  const of = (checkId: string): string[] => run.facts.filter((fact) => fact.checkId === checkId).map((fact) => `${fact.ciName}/${fact.field}/${stateOf(fact)}`).sort();
  const notes = (checkId: string): string[] => run.notes.filter((note) => note.startsWith(`${checkId}:`));
  return { run, result, of, notes };
}
const row = (name: string, cls: string, values: Partial<{ tag: string; status: string; group: string; active: string; created: string; updated: string; parent: string }> = {}): string[] =>
  [name, cls, values.tag ?? '', values.status ?? 'Operational', values.group ?? '', values.active ?? '', values.created ?? '2026-10-01 08:00:00', values.updated ?? '2026-11-01 08:00:00', values.parent ?? ''];

test('dates of a report: ISO with time, day first, Excel serial; days between two dates', () => {
  assert.equal(reportDate('2026-06-10 10:35:59'), '2026-06-10');
  assert.equal(reportDate('10-06-2026 10:35'), '2026-06-10');
  assert.equal(reportDate('10/06/2026'), '2026-06-10');
  assert.equal(reportDate('46338'), '2026-11-12');
  assert.equal(reportDate('soon'), '');
  assert.equal(reportDate('2026-02-31'), '');
  assert.equal(daysBetween('2026-08-13', '2026-11-11'), 90);
});

test('Support group inactive: only a filled group that is not active; grey with a note without the column', () => {
  const rows = [
    row('Fines - PROD', 'Service Instance', { tag: '1001', group: 'Old Team', active: 'false' }),
    row('Cards - PROD', 'Service Instance', { tag: '1002', group: 'Core Team', active: 'true' }),
    row('Rooms - PROD', 'Service Instance', { tag: '1003', group: '', active: 'false' }),
    row('Gone - PROD', 'Service Instance', { tag: '1004', status: 'Retired', group: 'Old Team', active: 'false' }),
    // Only Service Instances and Service Offerings are checked (D125).
    row('Index', 'Business Application', { group: 'Old Team', active: 'false' }),
    row('Fines Gold', 'Service Offering', { tag: '1001_01', group: 'Old Team', active: 'false' })
  ];
  const found = check(rows);
  assert.deepEqual(found.of('SUPPORT-GROUP-INACTIVE'), ['Fines - PROD/support_group/open', 'Fines Gold/support_group/open']);
  // No group at all stays on the card "Support group".
  assert.deepEqual(found.of('SUPPORT-GROUP-MISSING'), ['Rooms - PROD/support_group/open']);
  const fact = found.run.facts.find((item) => item.checkId === 'SUPPORT-GROUP-INACTIVE')!;
  assert.equal(fact.detail, 'Support group Old Team is not active');
  assert.equal(fact.contactEmail, 'ada@example.com');
  // The Support group is a ServiceNow field: never routed to EPO (D125).
  assert.equal(fact.route, '');

  const without = check(rows, { header: 'support_group.active' });
  assert.deepEqual(without.of('SUPPORT-GROUP-INACTIVE'), []);
  assert.equal(without.result.tested.some((entry) => entry.startsWith('SUPPORT-GROUP-INACTIVE:')), false);
  assert.match(without.notes('SUPPORT-GROUP-INACTIVE')[0]!, /Not tested: the report has no column that says if the Support group is active/);
});

test('Name not standard: the ending of each class, asked of the owner', () => {
  const found = check([
    row('Fines_BA', 'Business Application'), row('Cards', 'Business Application'), row('Rooms_ba', 'Business Application'),
    row('Fines_BS', 'Business Service', { tag: '2001_BS' }), row('Cards Service', 'Business Service', { tag: '2002_BS' }),
    row('Fines - PROD', 'Service Instance', { tag: '1001' }), row('Fines - TEST', 'Service Instance', { tag: '1002' }), row('Fines - ACC', 'Service Instance', { tag: '1003' }),
    row('Old_App', 'Business Application', { status: 'Retired' })
  ]);
  // A Business Application takes its name from its Service Instance: it is on Application ≠ Instance, not here (D180).
  assert.deepEqual(found.of('NAME-STANDARD'), ['Cards Service/bs-suffix/open', 'Fines - ACC/si-suffix/open']);
  assert.equal(found.run.facts.find((fact) => fact.checkId === 'NAME-STANDARD' && fact.ciName === 'Cards Service')!.detail, 'The name does not end with _BS');
  assert.equal(found.result.evaluated['NAME-STANDARD:ba-suffix'], undefined);
});

test('Name to tidy: an API offering with another dash and a space at the start or end are a SACM fix list', () => {
  const found = check([
    row('API - Fines', 'Service Offering'), row('API – Tickets', 'Service Offering'), row('API-Rooms', 'Service Offering'),
    row('Apiary Honey', 'Service Offering', { tag: '2001_01' }), row('API Gateway - PROD', 'Service Instance', { tag: '1001' }),
    row(' Open a Membership', 'Business Process'), row('Close a Membership ', 'Business Process'), row('Keep a Membership', 'Business Process')
  ]);
  assert.deepEqual(found.of('NAME-FORMAT'), ['API – Tickets/api-prefix/open', 'API-Rooms/api-prefix/open', 'Close a Membership/outer-space/open', 'Open a Membership/outer-space/open']);
  const fact = found.run.facts.find((item) => item.checkId === 'NAME-FORMAT' && item.field === 'api-prefix')!;
  assert.match(fact.fix!.set, /API - /);
  assert.equal(packs.find((pack) => pack.id === 'NAME-FORMAT')!.playbook.path, 'sacm-fix');
  // The rule is data: with "API-" as the instruction writes it, the names with spaces are the wrong ones.
  const rules = references['reference/name-rules'] as { rules: Array<{ id: string; pattern?: string }> };
  const strict = { ...references, 'reference/name-rules': { rules: rules.rules.map((rule) => (rule.id === 'api-prefix' ? { ...rule, pattern: '^API-\\S' } : rule)) } };
  assert.deepEqual(check([row('API - Fines', 'Service Offering'), row('API-Rooms', 'Service Offering')], { refs: strict }).of('NAME-FORMAT'), ['API - Fines/api-prefix/open']);
});

test('EPO ID: missing is to solve on a service or instance; offerings are not checked (D128)', () => {
  const found = check([
    row('Fines_BS', 'Business Service', { tag: '2001_BS' }), row('Cards_BS', 'Business Service'),
    row('Fines - PROD', 'Service Instance'), row('Cards - PROD', 'Service Instance', { tag: '1002' }),
    row('Fines Gold', 'Service Offering', { tag: '2999_01', parent: 'Fines_BS' }),
    row('Cards Standard', 'Service Offering', { parent: 'Cards_BS' }),
    row('Twin Standard', 'Service Offering', { tag: '1002' }),
    row('Fines_BA', 'Business Application'),
    row('Rooms - PROD', 'Service Instance', { status: 'Retired' })
  ]);
  assert.deepEqual(found.of('EPO-ID'), ['Cards_BS/missing/open', 'Fines - PROD/missing/open']);
  assert.match(check([row('Fines_BS', 'Business Service')], { header: 'asset_tag' }).notes('EPO-ID')[0]!, /Not tested: the report has no column for the EPO ID/);
});

test('EPO ID: two live CIs with the same EPO ID are both raised', () => {
  const found = check([
    row('Fines - PROD', 'Service Instance', { tag: '1001' }), row('Cards - PROD', 'Service Instance', { tag: '1001' }),
    row('Rooms - PROD', 'Service Instance', { tag: '1001', status: 'Retired' }), row('Events - PROD', 'Service Instance', { tag: '1003' })
  ]);
  assert.deepEqual(found.of('EPO-ID'), ['Cards - PROD/duplicate/open', 'Fines - PROD/duplicate/open']);
});

test('Under retirement too long: counted from the last change to the date of the report; the days are a team setting', () => {
  const rows = [
    row('Old - PROD', 'Service Instance', { tag: '1001', status: 'Under retirement', updated: '2026-08-12 10:00:00' }),
    row('Edge - PROD', 'Service Instance', { tag: '1002', status: 'Under retirement', updated: '2026-08-13 10:00:00' }),
    row('Fresh - PROD', 'Service Instance', { tag: '1003', status: 'Under retirement', updated: '2026-11-01 10:00:00' }),
    row('Live - PROD', 'Service Instance', { tag: '1004', updated: '2020-01-01 10:00:00' }),
    row('Odd - PROD', 'Service Instance', { tag: '1005', status: 'Under retirement', updated: 'last year' })
  ];
  const found = check(rows);
  // 91 days is too long, 90 days is not.
  assert.deepEqual(found.of('UNDER-RETIREMENT-LONG'), ['Old - PROD/under-retirement/open']);
  assert.equal(found.run.facts.find((fact) => fact.checkId === 'UNDER-RETIREMENT-LONG')!.detail, 'Status Under retirement, and the record did not change since 12 August 2026 (91 days)');
  assert.match(found.notes('UNDER-RETIREMENT-LONG')[0]!, /Partly tested: 1 CIs in status Under retirement have no date/);
  // The team sets 5 days in Settings.
  const short = check(rows, { refs: withTeamDays(references, { underRetirementDays: 5 }) });
  assert.deepEqual(short.of('UNDER-RETIREMENT-LONG'), ['Edge - PROD/under-retirement/open', 'Fresh - PROD/under-retirement/open', 'Old - PROD/under-retirement/open']);
  // No number in Settings, or a number that makes no sense: the proposed 90 days stay.
  assert.deepEqual(check(rows, { refs: withTeamDays(references, { underRetirementDays: 0 }) }).of('UNDER-RETIREMENT-LONG'), ['Old - PROD/under-retirement/open']);
  // Never silent: no column, or no date of the report.
  assert.match(check(rows, { header: 'sys_updated_on' }).notes('UNDER-RETIREMENT-LONG')[0]!, /Not tested: the report has no column for Updated/);
  assert.match(check(rows, { date: '' }).notes('UNDER-RETIREMENT-LONG')[0]!, /Not tested: the date of the report is not known/);
});

test('Ready too long: counted from the creation date, to solve although the CI is not live; capabilities in Ready are parked', () => {
  const found = check([
    row('Sleeper - PROD', 'Service Instance', { tag: '1001', status: 'Ready', created: '2021-03-01 09:00:00', group: '' }),
    row('New - PROD', 'Service Instance', { tag: '1002', status: 'Ready', created: '2026-09-01 09:00:00' }),
    row('Manage Events', 'Business Capability', { status: 'Ready', created: '2021-03-01 09:00:00' }),
    row('Manage Archive', 'Business Capability', { status: 'Ready', created: '2026-09-01 09:00:00' })
  ]);
  assert.deepEqual(found.of('READY-TOO-LONG'), ['Sleeper - PROD/ready/open']);
  // Its other problems still wait: the CI is not live.
  assert.deepEqual(found.of('SUPPORT-GROUP-MISSING'), ['New - PROD/support_group/waiting', 'Sleeper - PROD/support_group/waiting']);
  assert.deepEqual(found.notes('READY-TOO-LONG'), []);
  // A Business Capability in Ready is parked (D179): no line on any card, and its own card is switched off.
  assert.equal(found.run.facts.filter((fact) => fact.ciName.startsWith('Manage ')).length, 0);
  assert.equal(packs.find((pack) => pack.id === 'READY-TOO-LONG-BC')!.status, 'off');
  assert.deepEqual(found.run.parked!.lines[0], '2 Business Capabilities in Ready are not checked yet');
  // 90 days at first (D149): 71 days in Ready is not too long.
  assert.equal(found.of('READY-TOO-LONG').indexOf('New - PROD/ready/open'), -1);
});

test('the new packs are proposed, sit in their sections and name reference data that exists', () => {
  const sections: Record<string, string> = {
    'SUPPORT-GROUP-INACTIVE': 'correctness', 'NAME-STANDARD': 'compliance', 'NAME-FORMAT': 'compliance', 'EPO-ID': 'completeness',
    'UNDER-RETIREMENT-LONG': 'compliance', 'READY-TOO-LONG': 'compliance', 'LIFECYCLE-REVIEW': 'compliance'
  };
  for (const id of Object.keys(sections)) {
    const pack = packs.find((candidate) => candidate.id === id)!;
    // Support group inactive is confirmed by SACM (decision D48), so it is live; the others are still proposed.
    assert.equal(pack.status, id === 'SUPPORT-GROUP-INACTIVE' ? 'live' : 'proposed', id);
    assert.equal(pack.dimension, sections[id], id);
    if (pack.detector.ref) assert.notEqual(references[pack.detector.ref], undefined, id);
  }
});
