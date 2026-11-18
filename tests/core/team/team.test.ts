import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activity, activityChoices, cleanTeam, doubleContacts, loadersOf, mergeTeams, monthsToRecheck, myWork, parseTeam, personNotes, shareOut, sinceLastVisit, unassignedCount, writeTeam } from '../../../src/core/team/team.ts';
import { assignmentOf, buildCases } from '../../../src/core/cases/cases.ts';
import type { Case, CaseEvent, Fact, Reply, Run } from '../../../src/core/cases/cases.ts';

let counter = 0;
const event = (values: Partial<CaseEvent>): CaseEvent => ({ id: `e${++counter}`, at: '2026-11-12T09:00:00', by: 'ana@example.com', byName: 'Ana', type: 'note', keys: [], ...values });
const fact = (key: string, contact: string, values: Partial<Fact> = {}): Fact => ({
  key, checkId: 'OWNER-INACTIVE', ciKey: key.split('|')[1] ?? key, ciName: key, className: 'Business Application', field: 'owned_by', detail: 'Owner inactive',
  classLabel: 'Business Application', module: 'completeness', route: '', contactName: contact, contactEmail: `${contact.toLowerCase()}@example.com`,
  contactId: contact.toLowerCase(), contactVia: 'managed by', cc: [], ...values
} as Fact);
const run = (facts: Fact[]): Run => ({ date: '2026-11-12', report: 'cmdb_ci.csv', cis: facts.length, facts, tested: ['OWNER-INACTIVE:owned_by'], ciKeys: facts.map((item) => item.ciKey), notes: [] });
const rules = { reminderDays: 3, maxReminders: 2 };

test('the team list: one entry per email, sorted, the same bytes on every computer', () => {
  const members = cleanTeam([{ name: 'Oskar', email: 'oskar@example.com' }, { name: 'Ana', email: 'ana@example.com' }, { name: 'Ana B', email: 'ANA@example.com' }, { name: 'x', email: 'not an email' }]);
  assert.deepEqual(members.map((member) => member.name), ['Ana B', 'Oskar']);
  assert.equal(writeTeam(members), writeTeam(members.slice().reverse()));
  assert.deepEqual(parseTeam(writeTeam(members)), members);
  assert.deepEqual(parseTeam('not json'), []);
  // A conflict copy of the list: everybody on either list, and the result does not depend on which copy is which.
  const a = [{ name: 'Ana', email: 'ana@example.com' }];
  const b = [{ name: 'Oskar', email: 'oskar@example.com' }];
  assert.deepEqual(mergeTeams(a, b).map((member) => member.name), ['Ana', 'Oskar']);
  assert.equal(writeTeam(mergeTeams(a, b)), writeTeam(mergeTeams(b, a)));
});

test('assignment: the last assign or handover wins; a handover carries its note', () => {
  const assign = event({ type: 'assign', text: 'Ana', at: '2026-11-12T09:00:00' });
  const handover = event({ type: 'handover', to: 'Oskar', text: 'On leave until 20 November', at: '2026-11-12T10:00:00' });
  assert.deepEqual(assignmentOf([assign]), { to: 'Ana', handover: null });
  assert.deepEqual(assignmentOf([assign, handover]), { to: 'Oskar', handover });
  assert.deepEqual(assignmentOf([handover, event({ type: 'assign', text: '' })]), { to: '', handover: null });

  const cases = buildCases([run([fact('A|ci-1', 'Dee')])], [{ ...assign, keys: ['A|ci-1'] }, { ...handover, keys: ['A|ci-1'] }], [], '2026-11-12', rules);
  assert.equal(cases[0]!.assignedTo, 'Oskar');
  assert.equal(cases[0]!.handover?.text, 'On leave until 20 November');
});

test('share out: the biggest group first, always to the member with the fewest CIs', () => {
  const plan = shareOut([{ key: 'g1', size: 10 }, { key: 'g2', size: 6 }, { key: 'g3', size: 5 }, { key: 'g4', size: 1 }], ['Ana', 'Oskar']);
  assert.equal(plan.get('g1'), 'Ana');
  assert.equal(plan.get('g2'), 'Oskar');
  assert.equal(plan.get('g3'), 'Oskar');
  assert.equal(plan.get('g4'), 'Ana');
  assert.equal(shareOut([{ key: 'g1', size: 1 }], []).size, 0);
});

test('My work: my open cases by person to contact; answers first, then reminders due, then the rest', () => {
  const facts = [fact('A|ci-1', 'Dee'), fact('A|ci-2', 'Eve'), fact('A|ci-3', 'Fay'), fact('A|ci-4', 'Gus')];
  const events = [
    event({ type: 'assign', text: 'Ana', keys: ['A|ci-1', 'A|ci-2', 'A|ci-3'] }),
    event({ type: 'assign', text: 'Oskar', keys: ['A|ci-4'] }),
    event({ type: 'message', ref: 'SACM-1', to: 'eve@example.com', keys: ['A|ci-2'], at: '2026-11-02T09:00:00' }),
    event({ type: 'message', ref: 'SACM-2', to: 'fay@example.com', keys: ['A|ci-3'], at: '2026-11-11T09:00:00' })
  ];
  const replies: Reply[] = [{ ref: 'SACM-2', from: 'fay@example.com', received: '2026-11-11T12:00:00', subject: 'RE', text: 'Done', file: 'r.json' }];
  const cases = buildCases([run(facts)], events, replies, '2026-11-12', rules);
  const work = myWork(cases, 'Ana');
  assert.deepEqual(work.map((item) => [item.name, item.rank]), [['Fay', 0], ['Eve', 1], ['Dee', 2]]);
  assert.deepEqual(myWork(cases, 'Oskar').map((item) => item.name), ['Gus']);
  assert.deepEqual(myWork(cases, ''), []);
});

test('unassigned: groups with open work and nobody on it', () => {
  const cases = buildCases([run([fact('A|ci-1', 'Dee'), fact('A|ci-2', 'Eve')])], [event({ type: 'assign', text: 'Ana', keys: ['A|ci-1'] })], [], '2026-11-12', rules);
  const byKey = new Map(cases.map((item) => [item.key, item]));
  assert.equal(unassignedCount([[byKey.get('A|ci-1')!], [byKey.get('A|ci-2')!]]), 1);
});

test('since your last visit: what colleagues did, in short lines; my own work is left out', () => {
  const events = [
    event({ by: 'nia@example.com', byName: 'Nia', type: 'message', at: '2026-11-12T08:00:00' }),
    event({ by: 'nia@example.com', byName: 'Nia', type: 'message', at: '2026-11-12T08:05:00' }),
    event({ by: 'nia@example.com', byName: 'Nia', type: 'message', kind: 'reminder', at: '2026-11-12T08:06:00' }),
    event({ by: 'oskar@example.com', byName: 'Oskar', type: 'report', text: 'Loaded the CI report x.csv (report of 2026-11-12)', at: '2026-11-12T07:00:00' }),
    event({ by: 'oskar@example.com', byName: 'Oskar', type: 'note', at: '2026-11-01T07:00:00' }),
    event({ by: 'me@example.com', byName: 'Me', type: 'message', at: '2026-11-12T08:00:00' })
  ];
  const replies: Reply[] = [{ ref: 'R', from: 'x', received: '2026-11-12T09:00:00', subject: '', text: '', file: 'a' }, { ref: 'R', from: 'x', received: '2026-11-12T09:30:00', subject: '', text: '', file: 'b' }];
  assert.deepEqual(sinceLastVisit(events, replies, '2026-11-11T17:00:00', 'ME@example.com'), [
    'Nia sent 2 emails, sent 1 reminder', 'Oskar loaded the report of 12 Nov 2026', '2 replies arrived'
  ]);
  assert.deepEqual(sinceLastVisit(events, replies, '', 'me@example.com'), []);
});

test('double contact: a colleague wrote to the same person, or about the same CIs, in the last 24 hours', () => {
  const ciOf = (key: string): string => key.split('|')[1] ?? key;
  const events = [
    event({ id: 'm1', by: 'nia@example.com', byName: 'Nia', type: 'message', to: 'Dee@example.com; x@example.com', keys: ['A|ci-1', 'A|ci-2', 'B|ci-2'], at: '2026-11-12T10:12:00' }),
    event({ id: 'm2', by: 'nia@example.com', byName: 'Nia', type: 'message', to: 'other@example.com', keys: ['A|ci-3'], at: '2026-11-12T10:20:00' }),
    event({ id: 'm3', by: 'nia@example.com', byName: 'Nia', type: 'message', to: 'dee@example.com', keys: [], at: '2026-11-10T10:00:00' }),
    event({ id: 'm4', by: 'me@example.com', byName: 'Me', type: 'message', to: 'dee@example.com', keys: ['A|ci-1'], at: '2026-11-12T10:30:00' }),
    event({ id: 'n1', by: 'nia@example.com', byName: 'Nia', type: 'note', keys: ['A|ci-1'], at: '2026-11-12T10:30:00' })
  ];
  const found = doubleContacts(events, ['dee@example.com'], ['A|ci-1', 'A|ci-2', 'B|ci-2', 'A|ci-3'], 'me@example.com', '2026-11-12T11:00:00', ciOf);
  assert.deepEqual(found.map((item) => [item.event.id, item.samePerson, item.sameCis]), [['m2', false, 1], ['m1', true, 2]]);
  assert.deepEqual(doubleContacts(events, ['nobody@example.com'], [], 'me@example.com', '2026-11-12T11:00:00', ciOf), []);
});

test('the double-contact check reads last month too in the first days of a month', () => {
  assert.deepEqual(monthsToRecheck('2026-11-20'), ['2026-11']);
  assert.deepEqual(monthsToRecheck('2026-12-02'), ['2026-11', '2026-12']);
  assert.deepEqual(monthsToRecheck('2027-01-01'), ['2026-12', '2027-01']);
});

test('activity: newest first, each event once, filtered by manager and day', () => {
  const events = [event({ id: 'x1', at: '2026-11-11T09:00:00' }), event({ id: 'x2', at: '2026-11-12T09:00:00', by: 'oskar@example.com', byName: 'Oskar' }), event({ id: 'x2', at: '2026-11-12T09:00:00' })];
  assert.deepEqual(activity(events).map((item) => item.id), ['x2', 'x1']);
  assert.deepEqual(activity(events, { by: 'ANA@example.com' }).map((item) => item.id), ['x1']);
  assert.deepEqual(activity(events, { day: '2026-11-12' }).map((item) => item.id), ['x2']);
  assert.deepEqual(activityChoices(events), { people: [{ email: 'ana@example.com', name: 'Ana' }, { email: 'oskar@example.com', name: 'Oskar' }], days: ['2026-11-12', '2026-11-11'] });
});

test('notes about a person, and who loaded a report first', () => {
  const notes = [event({ type: 'person-note', person: 'dee', text: 'prefers Teams', at: '2026-11-11T09:00:00' }), event({ type: 'person-note', person: 'eve', text: 'x' }), event({ type: 'person-note', person: 'dee', text: 'on leave', at: '2026-11-12T09:00:00' })];
  assert.deepEqual(personNotes(notes, 'dee').map((item) => item.text), ['on leave', 'prefers Teams']);

  const file = '2026-11-12_cmdb_ci.csv.json';
  const loads = [
    event({ type: 'report', ref: file, text: 'Loaded the CI report', by: 'oskar@example.com', byName: 'Oskar', at: '2026-11-12T08:55:01' }),
    event({ type: 'report', ref: file, text: 'Loaded the CI report', by: 'ana@example.com', byName: 'Ana', at: '2026-11-12T08:55:00' })
  ];
  const found = loadersOf(loads, file);
  assert.equal(found.first?.byName, 'Ana');
  assert.deepEqual(found.others.map((item) => item.byName), ['Oskar']);
  // Removed and loaded again: not a double load.
  const again = loadersOf([loads[1]!, event({ type: 'report', ref: file, text: 'Removed the load', at: '2026-11-12T09:00:00' }), { ...loads[0]!, at: '2026-11-12T09:10:00' }], file);
  assert.deepEqual(again.others, []);
});

// Keeps the type import used when the helpers above change.
export type { Case };
