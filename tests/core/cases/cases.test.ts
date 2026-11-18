import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { addBusinessDays, isoDate } from '../../../src/core/shared/dates.ts';
import { decodeBase64Text } from '../../../src/core/shared/text.ts';
import { buildCases, buildRun, caseState, EPO_OWNER, groupCases, moduleScores, plannedRetirement } from '../../../src/core/cases/cases.ts';
import type { CaseEvent, Reply, Run } from '../../../src/core/cases/cases.ts';
import { resolveContact } from '../../../src/core/cases/contact.ts';
import { REQUESTS, buildDrafts, recipientOf, requestName } from '../../../src/core/messages/messages.ts';
import { htmlToText, parseReply } from '../../../src/core/cases/replies.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import { editSample, withoutTeams } from '../../helpers.ts';
import type { Ci, PersonRef } from '../../../src/core/model/model.ts';

const sample = readFileSync(join(import.meta.dirname, '../../..', 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const packs = loadPacks();
// The generic tests ask the people of a CI, also on the Business Processes of the sample; the team of reference/record-teams
// (Process Management, D195) has its own tests.
const allReferences = loadReferences();
const references = withoutTeams(allReferences);
const rules = { reminderDays: 3, maxReminders: 2 };
const settings = { portalLink: 'https://portal.example.com/sacm', signature: 'SACM team', epoOwnerName: 'Eve Inventory', epoOwnerEmail: 'eve@example.com' };

function run(csv: string, date: string): Run {
  const report = readCiReport(parseCsv(csv));
  return buildRun(report.cis, runChecks(report.cis, report.columns, packs, references, { date }), packs, date, `${date}.csv`, references);
}
let counter = 0;
const event = (values: Partial<CaseEvent>): CaseEvent => ({ id: `e${++counter}`, at: '2026-11-12T09:00:00', by: 'lena@example.com', byName: 'Lena', type: 'note', keys: [], ...values });
const byKey = <T extends { key: string }>(items: T[], key: string): T => items.find((item) => item.key === key)!;
const fixOwner = (csv: string): string => {
  let fixed = csv;
  for (const [column, value] of [['owned_by', 'Ada Example'], ['owned_by.email', 'ada@example.com'], ['owned_by.active', 'TRUE']]) fixed = editSample(fixed, 'Manage Member Records', column!, value!);
  return fixed;
};

test('dates and text helpers', () => {
  assert.equal(addBusinessDays('2026-11-12', 3), '2026-11-17');
  assert.equal(isoDate(46338), '2026-11-12');
  assert.equal(decodeBase64Text(Buffer.from('Café, Crème €', 'utf8').toString('base64')), 'Café, Crème €');
  assert.equal(decodeBase64Text(Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80]).toString('base64')), 'Café €');
});

test('a run records who to contact and the module of each finding', () => {
  const facts = run(sample, '2026-11-12').facts;
  assert.equal(facts.length, 33);
  // Owner missing: Managed by is asked first.
  assert.equal(byKey(facts, 'RESP-MISSING:manage member records:owned_by').contactEmail, 'cy@example.com');
  // Owner has left: Managed by is asked, by user ID.
  const left = byKey(facts, 'RESP-INACTIVE:reconcile index:owned_by');
  assert.deepEqual([left.contactVia, left.contactId, left.module], ['managed by', 'cy01', 'correctness']);
  // Manager has left: the owner is asked, and the person who left is never copied (Supported by is).
  assert.deepEqual([byKey(facts, 'RESP-INACTIVE:member engine - prod:managed_by').contactEmail, byKey(facts, 'RESP-INACTIVE:member engine - prod:managed_by').cc], ['dee@example.com', ['cy@example.com']]);
  assert.equal(byKey(facts, 'CRIT-NONE-REACHES:event engine:target').module, 'completeness');
});

test('contacts: inactive managers are skipped, the department head is the last fallback', () => {
  const person = (values: Partial<PersonRef>): PersonRef => ({ name: '', email: '', userId: '', active: null, manager: '', managerEmail: '', managerUserId: '', managerActive: null, departmentHead: '', departmentHeadEmail: '', departmentHeadUserId: '', ...values });
  const ci = { roles: { owned_by: person({ name: 'Bo', email: 'bo@example.com', active: false, manager: 'Max', managerEmail: 'max@example.com', managerActive: false, departmentHead: 'Hana', departmentHeadEmail: 'hana@example.com' }), managed_by: person({}) } } as unknown as Ci;
  const audience = packs.find((pack) => pack.id === 'RESP-INACTIVE')!.playbook.audience;
  assert.deepEqual(resolveContact(ci, 'owned_by', audience).to, { name: 'Hana', email: 'hana@example.com', id: 'hana@example.com', via: 'department head of owned by' });
  ci.roles.owned_by!.managerActive = true;
  assert.equal(resolveContact(ci, 'owned_by', audience).to!.email, 'max@example.com');
});

test('where a fix is made: EPO for a service, an instance and an offering from EPO; ServiceNow for the rest (D123)', () => {
  const facts = run(sample, '2026-11-12').facts;
  // A Business Service: written to the person, who corrects it in EPO.
  const epo = byKey(facts, 'DESC-QUALITY:members:description');
  assert.deepEqual([epo.route, epo.contactId], ['epo', 'ada01']);
  assert.equal(recipientOf(epo, settings).email, 'ada@example.com');
  // A service mapped Service Instance is fixed in EPO all the same: the flag plays no part (D124).
  assert.equal(byKey(facts, 'RESP-INACTIVE:member engine - prod:managed_by').route, 'epo');
  // The Support group is a ServiceNow field: always the ServiceNow request (D125).
  const group = byKey(facts, 'SUPPORT-GROUP-MISSING:fines hub - prod:support_group');
  assert.equal(group.route, '');
  assert.notEqual(group.contactId, EPO_OWNER);
  // The offering of the sample was created by the EPO integration (Created by is not a 3-character user ID).
  assert.equal(byKey(facts, 'DESC-QUALITY:members - standard:description').route, 'epo');
  // The same offering made by a person: fixed in ServiceNow.
  const byHand = run(editSample(sample, 'Members - Standard', 'sys_created_by', 'bo1'), '2026-11-12').facts;
  assert.equal(byKey(byHand, 'DESC-QUALITY:members - standard:description').route, '');
  // The table of the message knows the CI.
  assert.deepEqual(epo.ci, { epoId: 'AST-0010', status: 'Operational', supportGroup: '', ownedBy: 'Ada Example', managedBy: '' });
  // Nobody to ask on a CI from EPO: the EPO inventory owner is the fallback.
  const nobody = run(['Owned by', 'Managed by', 'Supported by'].reduce((csv, column) => editSample(csv, 'Members', column, ''),
    ['owned_by.email', 'owned_by.user_name', 'owned_by.manager.email', 'owned_by.department.dept_head.email'].reduce((csv, column) => editSample(csv, 'Members', column, ''), sample)), '2026-11-12').facts;
  const fallback = nobody.filter((fact) => fact.ciKey === 'members' && fact.route === 'epo');
  assert.ok(fallback.length > 0 && fallback.every((fact) => fact.contactId === EPO_OWNER));
  assert.equal(recipientOf(fallback[0]!, settings).email, 'eve@example.com');
  // Classes not fed by EPO and checks that do not depend on it are not routed.
  assert.equal(byKey(facts, 'DESC-QUALITY:reconcile index:description').route, '');
  assert.equal(byKey(facts, 'CRIT-NONE-REACHES:event engine:target').route, '');
  // Without the Created by column the run says so, and the offering is fixed in ServiceNow.
  const rows = parseCsv(sample);
  const at = rows[0]!.indexOf('sys_created_by');
  const noCreator = run(rows.map((cells) => cells.filter((_, index) => index !== at).map((cell) => `"${cell}"`).join(',')).join('\n'), '2026-11-12');
  assert.ok(noCreator.notes.some((note) => /no Created by column \(sys_created_by\), so 1 Service Offerings count as made by a person/.test(note)));
  assert.equal(byKey(noCreator.facts, 'DESC-QUALITY:members - standard:description').route, '');
  // Without the service mapped column nothing changes and nothing is said.
  const flagAt = rows[0]!.indexOf('ref_cmdb_ci_service.u_service_mapped');
  const noFlag = run(rows.map((cells) => cells.filter((_, index) => index !== flagAt).map((cell) => `"${cell}"`).join(',')).join('\n'), '2026-11-12');
  assert.deepEqual(noFlag.facts.map((fact) => fact.route), facts.map((fact) => fact.route));
  assert.ok(!noFlag.notes.some((note) => /service mapped/.test(note)));
});

test('cases follow what managers did; a fixed problem is verified by the next report', () => {
  const key = 'RESP-MISSING:manage member records:owned_by';
  const first = run(sample, '2026-11-12');
  const events = [
    event({ type: 'assign', keys: [key], text: 'Lena' }),
    event({ type: 'note', keys: [key], text: 'Asked in the weekly meeting', at: '2026-11-12T10:00:00' })
  ];
  let item = byKey(buildCases([first], events, [], '2026-11-12', rules), key);
  assert.deepEqual([item.status, item.assignedTo, item.firstSeen, item.timeline.length], ['New', 'Lena', '2026-11-12', 2]);

  const cases = buildCases([first, run(fixOwner(sample), '2026-11-13')], events, [], '2026-11-13', rules);
  item = byKey(cases, key);
  assert.deepEqual([item.status, item.verifiedOn, item.firstSeen], ['Verified', '2026-11-13', '2026-11-12']);
  assert.equal(cases.length, 33);
});

test('Verified only when the later report contains the CI', () => {
  const key = 'RESP-MISSING:manage member records:owned_by';
  const events = [event({ type: 'note', keys: [key], text: 'Chasing' })];
  // A partial report (a delta) without the CI: the case stays open.
  const delta = parseCsv(sample).filter((cells) => cells[0] !== 'Manage Member Records').map((cells) => cells.map((cell) => `"${cell}"`).join(',')).join('\n');
  const item = byKey(buildCases([run(sample, '2026-11-12'), run(delta, '2026-11-13')], events, [], '2026-11-13', rules), key);
  assert.deepEqual([item.status, item.ciMissing, item.verifiedOn], ['New', true, '']);
});

test('a report that cannot test a check never verifies its cases', () => {
  const rows = parseCsv(sample);
  const at = rows[0]!.indexOf('owned_by.active');
  const withoutActive = rows.map((cells) => cells.filter((_, index) => index !== at).map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const item = byKey(buildCases([run(sample, '2026-11-12'), run(withoutActive, '2026-11-13')], [], [], '2026-11-13', rules), 'RESP-INACTIVE:reconcile index:owned_by');
  assert.deepEqual([item.status, item.untested], ['New', true]);
});

test('shared cases: many CIs with one cause and one contact are one case', () => {
  const groups = groupCases(buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules));
  const capabilities = groups.find((group) => group.checkId === 'RESP-MISSING' && group.key.endsWith('|nobody'))!;
  assert.deepEqual([capabilities.ciCount, capabilities.members.length, capabilities.status, capabilities.state], [2, 4, 'New', 'open']);
  // The capability in Ready is parked (D179): no group at all, not even a waiting one.
  assert.equal(groups.filter((group) => group.members.some((item) => item.fact.ciKey === 'manage events')).length, 0);
  // A CI that is not live yet is a group of its own: waiting is never mixed with to solve.
  const waiting = groups.find((group) => group.state === 'waiting')!;
  assert.ok(waiting.members.every((item) => item.state === 'waiting'));
  assert.equal(groups.length, 26);
  // Groups run in module order: completeness, correctness, compliance.
  assert.equal(groups[0]!.module, 'completeness');
  assert.equal(groups[groups.length - 1]!.module, 'compliance');

  // When part of the group is fixed, the rest stays open. Both descriptions go to the same person in EPO, so they are one case.
  const keys = ['DESC-QUALITY:members:description', 'DESC-QUALITY:members - standard:description'];
  const sent = event({ type: 'message', keys, ref: 'SACM-G1', at: '2026-11-12T09:30:00' });
  // The offering without a Managed by: its description goes to its owner, the owner of the service too.
  const shared = ['managed_by', 'managed_by.email', 'managed_by.user_name'].reduce((csv, column) => editSample(csv, 'Members - Standard', column, ''), sample);
  const fixed = editSample(shared, 'Members', 'short_description', 'Service that lets customers hold and use members');
  const later = groupCases(buildCases([run(shared, '2026-11-12'), run(fixed, '2026-11-13')], [sent], [], '2026-11-13', rules));
  const epo = later.find((group) => group.members.some((item) => item.key === keys[0]))!;
  assert.deepEqual([epo.route, epo.members.length, epo.open.length, epo.status], ['epo', 2, 1, 'Contacted']);
  assert.equal(byKey(epo.members, keys[0]!).status, 'Verified');
});

test('parked: a Business Capability in Ready has no line on any card; its checks start when it is Operational (D179)', () => {
  const first = run(sample, '2026-11-12');
  assert.ok(!first.facts.some((fact) => fact.ciKey === 'manage events'));
  assert.deepEqual(first.parked!.lines, ['1 Business Capability in Ready is not checked yet', 'No API or Application CIs in this report', 'No Technology Management Service in this report']);
  // A case worked on while the capability was checked is not shown while it is parked, and is never Verified by it.
  const worked = { ...first, facts: first.facts.concat([{ ...first.facts[0]!, key: 'RESP-MISSING:manage events:owned_by', checkId: 'RESP-MISSING', ciKey: 'manage events', field: 'owned_by' }]), parked: undefined, date: '2026-11-11' };
  const note = event({ type: 'note', keys: ['RESP-MISSING:manage events:owned_by'], text: 'Asked' });
  assert.equal(buildCases([worked, first], [note], [], '2026-11-12', rules).filter((item) => item.fact.ciKey === 'manage events').length, 0);
  // Operational: checked as any capability.
  const live = run(editSample(sample, 'Manage Events', 'operational_status', '1'), '2026-11-13');
  assert.equal(byKey(live.facts, 'RESP-MISSING:manage events:owned_by').state, 'open');
  assert.equal(live.parked!.lines[0], 'No API or Application CIs in this report');
  // A parked CI is not counted as tested.
  assert.ok(live.evaluated!['RESP-MISSING:owned_by']! === first.evaluated!['RESP-MISSING:owned_by']! + 1);
});

test('module scores: share of evaluated checks that pass', () => {
  const scores = moduleScores(run(sample, '2026-11-12'), packs);
  // Only findings to solve count: waiting, known and review items are left out.
  assert.deepEqual(scores.completeness, { score: 81, tests: 70, problems: 13 });
  assert.equal(scores.compliance.problems, 3);
  assert.equal(moduleScores({ date: '', report: '', cis: 0, facts: [], tested: [], notes: [] }, packs).correctness.score, null);
});

test('drafts: one message per person across all modules; nothing without a contact', () => {
  const cases = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules);
  let n = 0;
  const { drafts, skipped } = buildDrafts(cases, packs, { ...settings, senderName: 'Sam Manager' }, () => `SACM-T${++n}`);
  const recipients = drafts.map((draft) => draft.to);
  assert.equal(new Set(recipients).size, recipients.length, 'one draft per person');
  const cy = drafts.find((draft) => draft.to === 'cy@example.com')!;
  assert.ok(cy.checkIds.length > 1);
  // Several kinds of problem: the subject says how many CIs, the reference comes last; each kind has a heading.
  assert.match(cy.subject, /^\d+ CIs need your attention in the CMDB \[SACM-T\d+\]$/);
  assert.match(cy.body, /<h3[^>]*>No (owner|manager)[^<]*<\/h3>/);
  assert.match(cy.body, /<th align="left" style="white-space:nowrap">What we found<\/th>/);
  assert.match(cy.plain, /^Hi Cy,/);
  assert.match(cy.plain, /Thank you,\nSam Manager\nSACM team$/);
  // The capabilities without anybody in a role cannot be written to.
  assert.ok(skipped.length >= 6 && skipped.every((item) => !recipientOf(item.fact, settings).email));
  const single = buildDrafts(cases.filter((item) => item.fact.checkId === 'DESC-QUALITY' && item.fact.route === ''), packs, settings, () => 'SACM-ONE').drafts
    .find((draft) => draft.to === 'dee@example.com')!;
  assert.equal(single.subject, 'No useful description on Close the Month [SACM-ONE]');
  // The table of the SACM template, without "What we found" for one kind of problem.
  assert.match(single.body, /<th align="left" style="white-space:nowrap">Name<\/th><th align="left" style="white-space:nowrap">EPO ID<\/th><th align="left" style="white-space:nowrap">Class<\/th><th align="left" style="white-space:nowrap">Owned by<\/th><th align="left" style="white-space:nowrap">Managed by<\/th><th align="left" style="white-space:nowrap">Status<\/th><th align="left" style="white-space:nowrap">Support group<\/th><\/tr>/);
  assert.match(single.body, /<td>Close the Month<\/td><td>AST-0021<\/td><td>Business Process<\/td>/);
  assert.match(single.plain, /ServiceNow names you as Owned by of the CI below\.\n\nThe description is empty, or does not say what the CI is\./);
  assert.match(single.plain, /The service desk and change approvers read it to understand the CI\./);
});

test('a problem on the record of a Business Process goes to the Process Management team, never to its people (D195)', () => {
  const report = readCiReport(parseCsv(sample));
  const facts = buildRun(report.cis, runChecks(report.cis, report.columns, packs, allReferences, { date: '2026-11-12' }), packs, '2026-11-12', 'r.csv', allReferences).facts;
  const process = byKey(facts, 'RESP-INACTIVE:reconcile index:owned_by');
  assert.deepEqual([process.contactId, process.contactName, process.contactVia, process.cc, process.escalateEmail ?? ''], ['team:process-management', 'Process Management', 'Process Management team', [], '']);
  assert.equal(byKey(facts, 'DESC-QUALITY:close the month:description').contactId, 'team:process-management');
  // Another class keeps its people; the mapping of a process stays with its owner (not on the team's list).
  assert.equal(byKey(facts, 'RESP-INACTIVE:member engine - prod:managed_by').contactEmail, 'dee@example.com');
  for (const fact of facts.filter((one) => one.className === 'business_process' && ['REL-MISSING', 'CRIT-TARGET-MISSING', 'CRIT-NO-JUSTIFICATION'].indexOf(one.checkId) >= 0)) assert.notEqual(fact.contactId, 'team:process-management', fact.key);

  // One message to every person of the team, with one table per kind of problem; nobody copied, never split.
  const cases = buildCases([{ ...run(sample, '2026-11-12'), facts }], [], [], '2026-11-12', rules);
  const team = { 'process-management': { name: 'Process Management', people: [{ name: 'Pat Process', email: 'pat@example.com' }, { name: 'Quinn Process', email: 'quinn@example.com' }] } };
  const ours = cases.filter((item) => item.fact.contactId === 'team:process-management');
  const { drafts } = buildDrafts(ours, packs, { ...settings, teams: team }, () => 'SACM-PM1');
  assert.equal(drafts.length, 1);
  const draft = drafts[0]!;
  assert.deepEqual([draft.to, draft.cc, draft.team, draft.part.count], ['pat@example.com; quinn@example.com', '', true, 1]);
  assert.match(draft.plain, /^Hi Process Management,/);
  assert.match(draft.plain, /Process Management is responsible for the record of the CIs below\. SACM updates ServiceNow with what you tell us\./);
  assert.match(draft.plain, /Could you tell us who took over\? Please reply to this email with the name of the person for each process, and we will update ServiceNow\./);
  assert.match(draft.plain, /Could you reply with one or two sentences per process/);
  assert.ok(!/Owned by - update|Service Portal/.test(draft.plain), 'the team is not sent to a request of the portal');
  // Without people in Settings nothing can be written, and the cases say so (skipped).
  assert.equal(buildDrafts(ours, packs, settings, () => 'SACM-PM2').skipped.length, ours.length);
  assert.equal(recipientOf(process, { ...settings, teams: team }).email, 'pat@example.com; quinn@example.com');
});

test('drafts for CIs from EPO: correct it in EPO; never a word on the service mapped flag (D124)', () => {
  const cases = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules);
  const synced = buildDrafts(cases.filter((item) => item.key === 'DESC-QUALITY:members:description'), packs, settings, () => 'SACM-E1').drafts[0]!;
  assert.equal(synced.to, 'ada@example.com');
  assert.match(synced.plain, /These CIs come from EPO\. Please correct the description in EPO\. ServiceNow receives the change from EPO\./);
  const mapped = buildDrafts(cases.filter((item) => item.key === 'RESP-INACTIVE:member engine - prod:managed_by'), packs, settings, () => 'SACM-E2').drafts[0]!;
  assert.match(mapped.subject, /^Inactive manager on Member Engine - PROD \[SACM-E2\]$/);
  assert.match(mapped.plain, /In EPO, Managed by is called Primary Responsible\. Please correct it in EPO\. ServiceNow receives the change from EPO\./);
  for (const draft of [synced, mapped]) assert.doesNotMatch(draft.plain, /service mapped|reply to this email when it is done|synchroni/i);
});

test('drafts in ServiceNow: Support group and hand-made offerings name their request (D125, D126)', () => {
  const byHand = editSample(sample, 'Members - Standard', 'sys_created_by', 'bo1');
  const cases = buildCases([run(byHand, '2026-11-12')], [], [], '2026-11-12', rules);
  // The Support group of a Service Instance: the request Support group update, never EPO.
  const group = buildDrafts(cases.filter((item) => item.key === 'SUPPORT-GROUP-MISSING:fines hub - prod:support_group'), packs, settings, () => 'SACM-S1').drafts[0]!;
  assert.match(group.plain, /Please raise the request "Support group update" in the Service Portal/);
  assert.doesNotMatch(group.plain, /EPO\./);
  // The description of an offering made by a person: reply, or the request Add or modify a Service (CI).
  const offering = buildDrafts(cases.filter((item) => item.key === 'DESC-QUALITY:members - standard:description'), packs, settings, () => 'SACM-S2').drafts[0]!;
  assert.match(offering.plain, /one or two sentences per offering.*raise the request "Add or modify a Service \(CI\)", action "Modify service offering", in the Service Portal/);
  // Another class: the same request by its name only.
  const other = buildDrafts(cases.filter((item) => item.key === 'DESC-QUALITY:close the month:description'), packs, settings, () => 'SACM-S3').drafts[0]!;
  assert.match(other.plain, /You can also raise the request "Add or modify a Service \(CI\)" in the Service Portal/);
  assert.doesNotMatch(other.plain, /action "Modify service offering"/);
});

test('drafts: the request is named with its link from Settings; criticality is in words', () => {
  // Above parent asks the owner for the request once SACM checked the mapping (D134).
  const cases = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules).filter((item) => item.key === 'CRIT-ABOVE-PARENT:index tool - prod:confidentiality');
  const linked = { ...settings, requests: { criticality: { name: 'Criticality - change CIAA values', link: 'https://portal.example.com/ciaa' } } };
  const draft = buildDrafts(cases, packs, linked, () => 'SACM-C1').drafts[0]!;
  assert.match(draft.body, /the request "<a href="https:\/\/portal\.example\.com\/ciaa">Criticality - change CIAA values<\/a>"/);
  assert.match(draft.plain, /"Criticality - change CIAA values" \(https:\/\/portal\.example\.com\/ciaa\)/);
  assert.doesNotMatch(draft.plain, /is [1-4],/);
  // Without a link: the Service Portal link of the settings.
  assert.match(buildDrafts(cases, packs, settings, () => 'SACM-C2').drafts[0]!.plain, /"Criticality - change CIAA values" in the Service Portal \(https:\/\/portal\.example\.com\/sacm\)/);
});

test('drafts: a message holds at most 25 CIs; a longer one is split into parts', () => {
  const base = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules).find((item) => item.key === 'DESC-QUALITY:close the month:description')!;
  const many = Array.from({ length: 60 }, (_, index) => ({ ...base, key: `k${index}`, fact: { ...base.fact, ciKey: `ci${index}`, ciName: `CI ${String(index).padStart(2, '0')}` } }));
  let n = 0;
  const drafts = buildDrafts(many, packs, settings, () => `SACM-P${++n}`).drafts;
  assert.deepEqual(drafts.map((draft) => [draft.ciCount, draft.part.index, draft.part.count]), [[25, 1, 3], [25, 2, 3], [10, 3, 3]]);
  assert.equal(drafts[0]!.subject, 'No useful description on 25 CIs (part 1 of 3) [SACM-P1]');
  assert.equal(new Set(drafts.map((draft) => draft.ref)).size, 3);
});

test('message, reply, reminder: the status moves only on what people did or received', () => {
  const key = 'DESC-QUALITY:close the month:description';
  const runs = [run(sample, '2026-11-12')];
  const sent = event({ type: 'message', keys: [key], ref: 'SACM-AB12', to: 'dee@example.com', kind: 'first', at: '2026-11-12T09:30:00' });
  let item = byKey(buildCases(runs, [sent], [], '2026-11-16', rules), key);
  assert.deepEqual([item.status, item.reminderDue], ['Contacted', false]);
  item = byKey(buildCases(runs, [sent], [], '2026-11-17', rules), key);
  assert.equal(item.reminderDue, true);
  // The reminder draft keeps the reference of the first message.
  const reminder = buildDrafts([item], packs, settings, () => 'SACM-NEW').drafts[0]!;
  assert.equal(reminder.subject, 'Reminder: No useful description on Close the Month [SACM-AB12]');
  assert.match(reminder.plain, /^Hi Dee,\n\nA short reminder of our message of 12 November 2026\. The CI below is still open\./);

  const reply: Reply = { ref: 'SACM-AB12', from: 'dee@example.com', received: '2026-11-17T11:00:00', subject: 'RE: [SACM-AB12] …', text: 'It is the index tool.', file: 'r1.json' };
  item = byKey(buildCases(runs, [sent], [reply], '2026-11-18', rules), key);
  assert.deepEqual([item.status, item.reminderDue, item.replies.length], ['Answered', false, 1]);
  const progress = event({ type: 'status', keys: [key], text: 'Fix in progress', at: '2026-11-18T08:00:00' });
  assert.equal(byKey(buildCases(runs, [sent, progress], [reply], '2026-11-18', rules), key).status, 'Fix in progress');

  const reminders = [sent, event({ type: 'message', keys: [key], ref: 'SACM-AB12', kind: 'reminder', at: '2026-11-17T09:00:00' }), event({ type: 'message', keys: [key], ref: 'SACM-AB12', kind: 'reminder', at: '2026-11-20T09:00:00' })];
  item = byKey(buildCases(runs, reminders, [], '2026-11-30', rules), key);
  assert.deepEqual([item.reminderDue, item.overLimit], [false, true]);
  // No answer after the reminders: the draft goes to the person's manager, with the person in copy.
  const escalation = buildDrafts([item], packs, settings, () => 'SACM-NEW').drafts[0]!;
  assert.deepEqual([escalation.kind, escalation.to, escalation.ref], ['escalation', 'max@example.com', 'SACM-AB12']);
  assert.ok(escalation.cc.split('; ').includes('dee@example.com'));
  assert.equal(escalation.subject, 'No answer on 1 CI of Dee Owner [SACM-AB12]');
  assert.match(escalation.plain, /^Hi Max,\n\nWe asked Dee Owner three times about the CI below and got no answer\. You are their manager in ServiceNow\./);
});

test('replies: read from the filed email, matched by reference, shown as text', () => {
  const file = JSON.stringify({ from: 'dee@example.com', received: '2026-11-17T11:00:00Z', subject: 'SV: [sacm-ab12] CIs without…', body: '<html><head><style>p{}</style></head><body><p>Hi,</p><p>It is the <b>index</b> tool &amp; reports.<br>Dee</p><script>alert(1)</script></body></html>' });
  const reply = parseReply(file, 'r1.json')!;
  assert.equal(reply.ref, 'SACM-AB12');
  assert.equal(reply.text, 'Hi,\nIt is the index tool & reports.\nDee');
  assert.equal(parseReply(JSON.stringify({ subject: 'Out of office' }), 'r2.json'), null);
  assert.equal(parseReply('not json', 'r3.json'), null);
  assert.equal(htmlToText('a<br>b'), 'a\nb');
});

test('every message text follows the SACM template: subject, first sentence, ask, why it matters', () => {
  for (const pack of packs.filter((candidate) => candidate.playbook.message)) {
    const texts = pack.playbook.message!;
    for (const part of [texts.subject, texts.intro, texts.ask, texts.why]) assert.ok(part && part.trim(), `${pack.id}: a text is missing`);
    const all = [texts.subject, texts.intro, texts.ask, texts.why, texts.epoAsk ?? '', ...Object.values(texts.askByClass ?? {})];
    assert.ok(all.every((text) => !/\{(?!role\}|who\}|epoRole\}|request(:[a-z-]+)?\}|form:[a-z-]+\}|[rR]eply\})/.test(text)), `${pack.id}: unknown placeholder`);
  }
});

test('listing: not live yet waits, a tag makes it known, a review check is never to solve; older runs are open', () => {
  const facts = run(sample, '2026-11-12').facts;
  // Status Ready: not live yet.
  const inReady = editSample(sample, 'Member Engine - TEST', 'operational_status', '5');
  const ready = byKey(run(inReady, '2026-11-12').facts, 'SUPPORTED-BY:member engine - test:supported_by');
  assert.deepEqual([ready.state, ready.stateWhy], ['waiting', 'Status Ready: not live yet']);
  // A tag of the team explains it.
  const tagged = byKey(facts, 'CRIT-NONE-REACHES:event desk:target');
  assert.deepEqual([tagged.state, tagged.stateWhy], ['known', 'Tagged BIA is pending']);
  assert.equal(byKey(facts, 'CRIT-NONE-REACHES:event engine:target').state, 'review');
  // Above parent: SACM checks the mapping first, so it starts as a review.
  assert.ok(facts.filter((fact) => fact.checkId === 'CRIT-ABOVE-PARENT').every((fact) => fact.state === 'review'));
  // Descoped is not deletion: no finding, a chip on the CI.
  assert.ok(!facts.some((fact) => fact.checkId === 'TAG-STATUS-CONFLICT' && fact.ciKey === 'index tool - prod'));
  assert.deepEqual(byKey(facts, 'CRIT-ABOVE-PARENT:index tool - prod:confidentiality').ci!.chips, ['to map']);

  // The rules are data: without the reference files everything is to solve, and the run says so.
  const report = readCiReport(parseCsv(sample));
  const bare = { 'reference/epo-synced-classes': references['reference/epo-synced-classes'], 'reference/mandatory-tags': references['reference/mandatory-tags'] };
  const plain = buildRun(report.cis, runChecks(report.cis, report.columns, packs, bare), packs, '2026-11-12', 'x.csv', bare);
  assert.ok(plain.facts.every((fact) => fact.state === 'open' || fact.state === 'review'));
  assert.equal(plain.notes.filter((note) => /^Listing: reference data missing/.test(note)).length, 2);

  // When the CI goes live, its findings are to solve at the next report. Nothing is lost.
  const cases = buildCases([run(inReady, '2026-11-12'), run(sample, '2026-11-13')], [], [], '2026-11-13', rules);
  const item = byKey(cases, 'SUPPORTED-BY:member engine - test:supported_by');
  assert.deepEqual([item.state, item.firstSeen], ['open', '2026-11-12']);

  // A run saved before version 0.9 has no state: its facts are to solve.
  const old = run(sample, '2026-11-12');
  for (const fact of old.facts) { delete fact.state; delete fact.stateWhy; }
  assert.ok(buildCases([old], [], [], '2026-11-12', rules).every((entry) => entry.state === 'open'));
  assert.equal(moduleScores(old, packs).completeness.problems, 16);
});

test('requests follow the Service Portal: a form with an action, and no request for Supported by', () => {
  const cases = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules);
  const base = cases.find((item) => item.fact.checkId === 'RESP-INACTIVE' && item.fact.route === '')!;
  const draftFor = (field: string, set = settings) => buildDrafts([{ ...base, fact: { ...base.fact, field } }], packs, set, () => 'SACM-R1').drafts[0]!.plain;
  // Supported by has no request in the portal: the message asks for a reply only.
  assert.match(draftFor('supported_by'), /Could you tell us who took over\? Please reply to this email, and we will update ServiceNow for you\./);
  assert.doesNotMatch(draftFor('supported_by'), /raise the request/);
  assert.match(draftFor('managed_by'), /or raise the request "Managed by – update" in the Service Portal/);
  // A name saved before version 0.14.1 that is still the old default gets the name of the portal; a changed name is kept.
  assert.equal(requestName('managed-by-update', 'Managed by - update'), 'Managed by – update');
  assert.equal(requestName('modify-service-offering', 'Modify service offering'), 'Add or modify a Service (CI)');
  assert.equal(requestName('criticality', 'CIAA change'), 'CIAA change');
  assert.ok(!REQUESTS.some((request) => /supported/i.test(request.id)));
  // "Modify service offering" is an action inside the form "Add or modify a Service (CI)".
  const offering = cases.find((item) => item.fact.checkId === 'SUPPORT-GROUP-MISSING')!;
  const asOffering = { ...offering, fact: { ...offering.fact, route: '' as const, className: 'service_offering' } };
  const linked = { ...settings, requests: { 'modify-service-offering': { name: 'Modify service offering', link: 'https://portal.example.com/service' } } };
  const text = buildDrafts([asOffering], packs, linked, () => 'SACM-R2').drafts[0]!;
  assert.match(text.plain, /Please raise the request "Add or modify a Service \(CI\)", action "Modify service offering" \(https:\/\/portal\.example\.com\/service\)\./);
  assert.match(text.body, /"<a href="https:\/\/portal\.example\.com\/service">Add or modify a Service \(CI\)<\/a>", action &quot;Modify service offering&quot;/);
});

test('a planned retirement date: the case waits until the date, gets no reminder, and is to solve again on the date', () => {
  const first = run(sample, '2026-11-12');
  const fact = first.facts.filter((one) => one.checkId === 'TAG-STATUS-CONFLICT')[0]!;
  assert.equal(packs.find((pack) => pack.id === 'TAG-STATUS-CONFLICT')!.playbook.retirementDate, true);
  const sent = event({ type: 'message', keys: [fact.key], ref: 'SACM-R1', at: '2026-11-02T09:00:00' });
  const dated = event({ type: 'retirement', keys: [fact.key], retireOn: '2027-06-30', text: 'Data kept for the audit', at: '2026-11-12T11:00:00' });
  const before = byKey(buildCases([first], [sent], [], '2026-11-12', rules), fact.key);
  assert.deepEqual([before.state, before.reminderDue, before.retireOn], ['open', true, '']);
  const waiting = byKey(buildCases([first], [sent, dated], [], '2026-11-12', rules), fact.key);
  assert.deepEqual([waiting.state, waiting.reminderDue, waiting.overLimit, waiting.retireOn], ['waiting', false, false, '2027-06-30']);
  assert.equal(groupCases([waiting]).every((group) => group.state === 'waiting'), true);
  // On the date it is to solve again.
  assert.equal(byKey(buildCases([first], [sent, dated], [], '2027-06-30', rules), fact.key).state, 'open');
  // Taken away: to solve at once.
  const away = event({ type: 'retirement', keys: [fact.key], retireOn: '', at: '2026-11-12T12:00:00' });
  assert.equal(byKey(buildCases([first], [sent, dated, away], [], '2026-11-12', rules), fact.key).state, 'open');
  // A finding that waits for another reason keeps its reason.
  assert.equal(caseState({ state: 'review' }, [dated], '2026-11-12'), 'review');
  assert.equal(plannedRetirement([dated, away]), '');
});

/* ------------------------------------------------------------------ messages and follow-up (version 0.21) */

const somebody = (values: Partial<PersonRef>): PersonRef => ({ name: '', email: '', userId: '', active: null, manager: '', managerEmail: '', managerUserId: '', managerActive: null, departmentHead: '', departmentHeadEmail: '', departmentHeadUserId: '', ...values });
const cy = (): PersonRef => somebody({ name: 'Cy Manager', email: 'cy@example.com', userId: 'cy01' });
/** Who gets the escalation when the Support group of this CI is missing: the check asks Managed by first. */
const aboveOfManagedBy = (owner: PersonRef | undefined): unknown => {
  const ci = { roles: { ...(owner ? { owned_by: owner } : {}), managed_by: cy() } } as unknown as Ci;
  const found = resolveContact(ci, 'support_group', ['managed_by', 'owned_by']).to!;
  assert.equal(found.via, 'managed by');
  return found.above ? [found.above.email, found.above.via] : null;
};

test('escalation for a Managed by person: the owner of the CI, else the owner\'s manager, else nobody (D160)', () => {
  assert.deepEqual(aboveOfManagedBy(somebody({ name: 'Dee Owner', email: 'dee@example.com', userId: 'dee01', active: true })), ['dee@example.com', 'owner']);
  // No owner: nobody is known, the step is "cannot escalate".
  assert.equal(aboveOfManagedBy(undefined), null);
  // An owner who left: the owner's manager, when the report gives one.
  assert.deepEqual(aboveOfManagedBy(somebody({ name: 'Bo Leaver', email: 'bo@example.com', active: false, manager: 'Max Manager', managerEmail: 'max@example.com' })), ['max@example.com', 'manager of owner']);
  assert.equal(aboveOfManagedBy(somebody({ name: 'Bo Leaver', email: 'bo@example.com', active: false })), null);
  // The owner is the Managed by person: the owner's manager.
  assert.deepEqual(aboveOfManagedBy({ ...cy(), manager: 'Max Manager', managerEmail: 'max@example.com' }), ['max@example.com', 'manager of owner']);
  assert.equal(aboveOfManagedBy(cy()), null);
  // For an owner, the rule stays the person's manager (D40).
  const owned = { roles: { owned_by: somebody({ name: 'Dee Owner', email: 'dee@example.com', manager: 'Max Manager', managerEmail: 'max@example.com' }), managed_by: cy() } } as unknown as Ci;
  assert.deepEqual([resolveContact(owned, 'support_group', ['owned_by']).to!.above!.email, resolveContact(owned, 'support_group', ['owned_by']).to!.above!.via], ['max@example.com', 'manager']);
});

/** Three messages with no answer on the cases of the sample that ask Cy as Managed by. */
function overLimitOfCy(): ReturnType<typeof buildCases> {
  const runs = [run(sample, '2026-11-12')];
  const keys = runs[0]!.facts.filter((fact) => fact.contactVia === 'managed by' && fact.contactEmail === 'cy@example.com' && fact.escalateVia === 'owner').map((fact) => fact.key);
  const sent = ['2026-11-12', '2026-11-17', '2026-11-20'].map((day, index) => event({ type: 'message', keys, ref: 'SACM-CY', to: 'cy@example.com', kind: index ? 'reminder' : 'first', at: `${day}T09:00:00` }));
  return buildCases(runs, sent, [], '2026-11-30', rules).filter((item) => keys.includes(item.key));
}

test('escalation drafts: one message per owner, with the Managed by person in copy; never a silent reminder (F01)', () => {
  const over = overLimitOfCy();
  assert.ok(over.length >= 2 && over.every((item) => item.overLimit));
  const owners = Array.from(new Set(over.map((item) => item.fact.escalateEmail))).sort();
  assert.ok(owners.length >= 2, 'the sample has CIs of two owners managed by Cy');
  const { drafts } = buildDrafts(over, packs, settings, () => 'SACM-NEW');
  assert.deepEqual(drafts.map((draft) => draft.kind), owners.map(() => 'escalation'));
  assert.deepEqual(drafts.map((draft) => draft.to).sort(), owners);
  for (const draft of drafts) {
    assert.ok(draft.cc.split('; ').includes('cy@example.com'));
    assert.match(draft.plain, /You are the owner \(Owned by\) of the CIs? below\. We asked Cy Keeper, the Managed by person, three times and got no answer\./);
    // Only the CIs of this owner.
    assert.ok(draft.keys.every((key) => over.find((item) => item.key === key)!.fact.escalateEmail === draft.to));
  }
  // Nobody known: an escalation without an address, never a fourth reminder.
  const nobody = over.map((item) => ({ ...item, fact: { ...item.fact, escalateEmail: '', escalateName: '' } }));
  const unknown = buildDrafts(nobody, packs, settings, () => 'SACM-NEW').drafts;
  assert.deepEqual(unknown.map((draft) => [draft.kind, draft.to, draft.nobodyAbove]), [['escalation', '', true]]);
  // The manager types who gets it.
  const typed = buildDrafts(nobody, packs, settings, () => 'SACM-NEW', { escalateTo: { name: 'Hana Head', email: 'hana@example.com' } }).drafts[0]!;
  assert.deepEqual([typed.kind, typed.to], ['escalation', 'hana@example.com']);
  assert.match(typed.plain, /^Hi Hana,\n\nWe asked Cy Keeper three times about the CIs below and got no answer\./);
  // Or chooses one more reminder.
  assert.deepEqual(buildDrafts(nobody, packs, settings, () => 'SACM-NEW', { remindInstead: true }).drafts.map((draft) => [draft.kind, draft.to]), [['reminder', 'cy@example.com']]);
});

test('the reminder names the first contact, by any channel, and never an empty date (F02)', () => {
  const key = 'DESC-QUALITY:close the month:description';
  const runs = [run(sample, '2026-11-12')];
  const chat = event({ type: 'message', keys: [key], ref: 'SACM-T1', to: 'dee@example.com', kind: 'first', channel: 'teams', at: '2026-11-12T09:30:00' });
  const later = event({ type: 'message', keys: [key], ref: 'SACM-T1', to: 'dee@example.com', kind: 'reminder', channel: 'mailbox', at: '2026-11-17T09:30:00' });
  const first = buildDrafts([byKey(buildCases(runs, [chat], [], '2026-11-17', rules), key)], packs, settings, () => 'SACM-NEW').drafts[0]!;
  assert.match(first.plain, /A short reminder of our Teams message of 12 November 2026\. The CI below is still open\./);
  // A later reminder still names the first contact, not the last reminder.
  const second = buildDrafts([byKey(buildCases(runs, [chat, later], [], '2026-11-20', rules), key)], packs, settings, () => 'SACM-NEW').drafts[0]!;
  assert.match(second.plain, /A short reminder of our Teams message of 12 November 2026\./);
  const undated = { ...byKey(buildCases(runs, [chat], [], '2026-11-17', rules), key) };
  undated.messages = undated.messages.map((message) => ({ ...message, at: '' }));
  assert.match(buildDrafts([undated], packs, settings, () => 'SACM-NEW').drafts[0]!.plain, /^Hi Dee,\n\nA short reminder\. The CI below is still open\./);
});

test('a reminder and the new points of the same person are one email with two parts (D161)', () => {
  const runs = [run(sample, '2026-11-12')];
  const mine = runs[0]!.facts.filter((fact) => fact.contactEmail === 'dee@example.com' && packs.find((pack) => pack.id === fact.checkId)?.playbook.message);
  assert.ok(mine.length >= 3);
  const reminded = mine[0]!.key;
  const sent = event({ type: 'message', keys: [reminded], ref: 'SACM-R1', to: 'dee@example.com', kind: 'first', at: '2026-11-12T09:30:00' });
  const cases = buildCases(runs, [sent], [], '2026-11-17', rules).filter((item) => mine.slice(0, 3).some((fact) => fact.key === item.key));
  const { drafts } = buildDrafts(cases, packs, settings, () => 'SACM-NEW');
  assert.equal(drafts.length, 1, 'one draft, not a reminder and a first message');
  const draft = drafts[0]!;
  assert.deepEqual([draft.kind, draft.ref, draft.keys.length, draft.newKeys.length], ['reminder', 'SACM-R1', 3, 2]);
  assert.ok(!draft.newKeys.includes(reminded));
  assert.match(draft.subject, /^Reminder: /);
  assert.match(draft.plain, /== STILL OPEN \(OUR MESSAGE OF 12 NOVEMBER 2026\) ==[\s\S]+== NEW SINCE THEN ==/);
  assert.match(draft.body, /<h2[^>]*>Still open \(our message of 12 November 2026\)<\/h2>[\s\S]+<h2[^>]*>New since then<\/h2>/);
  // The journal: a reminder line for the first part and a first-message line for the second, with the same reference.
  const lines = [
    event({ type: 'message', keys: draft.keys.filter((key) => !draft.newKeys.includes(key)), ref: draft.ref, kind: 'reminder', at: '2026-11-17T10:00:00' }),
    event({ type: 'message', keys: draft.newKeys, ref: draft.ref, kind: 'first', at: '2026-11-17T10:00:00' })
  ];
  const after = buildCases(runs, [sent, ...lines], [], '2026-11-17', rules);
  assert.deepEqual([reminded, ...draft.newKeys].map((key) => byKey(after, key).messages.length), [2, 1, 1]);
  // A reply with the reference reaches the cases of both parts.
  const reply: Reply = { ref: 'SACM-R1', from: 'dee@example.com', received: '2026-11-18T11:00:00', subject: 'RE: [SACM-R1]', text: 'Done.', file: 'r2.json' };
  assert.ok(draft.keys.every((key) => byKey(buildCases(runs, [sent, ...lines], [reply], '2026-11-18', rules), key).status === 'Answered'));
});

test('a message that waits in the outbox is queued: the days to the reminder start when it is sent (D162)', () => {
  const key = 'DESC-QUALITY:close the month:description';
  const runs = [run(sample, '2026-11-12')];
  const sent = event({ type: 'message', keys: [key], ref: 'SACM-Q1', to: 'dee@example.com', kind: 'first', channel: 'mailbox', text: 'SACM-Q1_x.json', at: '2026-11-12T09:30:00' });
  const waiting = byKey(buildCases(runs, [sent], [], '2026-11-30', rules, undefined, { queued: new Set(['SACM-Q1_x.json']), sentOn: new Map() }), key);
  assert.deepEqual([waiting.status, waiting.queued, waiting.reminderDue, waiting.sentOn], ['Contacted', true, false, '']);
  // Sent on 20 November: the reminder is due three working days later, on 25 November.
  const delivery = { queued: new Set<string>(), sentOn: new Map([['SACM-Q1_x.json', '2026-11-20']]) };
  assert.deepEqual([byKey(buildCases(runs, [sent], [], '2026-11-24', rules, undefined, delivery), key).reminderDue, byKey(buildCases(runs, [sent], [], '2026-11-25', rules, undefined, delivery), key).reminderDue], [false, true]);
  assert.equal(byKey(buildCases(runs, [sent], [], '2026-11-25', rules, undefined, delivery), key).sentOn, '2026-11-20');
  // Without knowledge of the outbox (older callers), the message counts from the day it was recorded.
  assert.equal(byKey(buildCases(runs, [sent], [], '2026-11-17', rules), key).reminderDue, true);
});

test('message wording: "the CI below" for one CI, "the CIs below" for more (F40)', () => {
  const cases = buildCases([run(sample, '2026-11-12')], [], [], '2026-11-12', rules).filter((item) => item.fact.contactEmail === 'dee@example.com' && item.state === 'open');
  const one = buildDrafts(cases.filter((item) => item.key === 'DESC-QUALITY:close the month:description'), packs, settings, () => 'SACM-ONE').drafts[0]!;
  assert.match(one.plain, /ServiceNow names you as Owned by of the CI below\./);
  const many = buildDrafts(cases, packs, settings, () => 'SACM-MANY').drafts[0]!;
  assert.match(many.plain, /ServiceNow names you as Owned by of the CIs below\./);
  assert.ok(!/You are Owned by on/.test(one.plain + many.plain));
});
