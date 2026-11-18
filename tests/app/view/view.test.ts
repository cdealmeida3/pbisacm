import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { checksInUse, runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { buildCases, buildRun } from '../../../src/core/cases/cases.ts';
import type { Case, CaseEvent, Reply } from '../../../src/core/cases/cases.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import { asideText, cardKind, cardSummaries, cardTotals, fixProgress, testedOn } from '../../../src/app/view/cards.ts';
import { fixGroups, fixRecords, fixRows } from '../../../src/app/view/fix-list.ts';
import { cardWords } from '../../../src/app/view/activity.ts';
import { memoryOf, repliesToRead, statusWord } from '../../../src/app/view/cases.ts';
import { describeEvent, oneLinePerMessage } from '../../../src/app/view/activity.ts';
import { exportCsv } from '../../../src/app/view/exports.ts';
import { askedName, classesOf, groupChip, groupStatusWord, memoryWords, nextStep, noOwnerReason, ownerGroups, stepWords, teamsLink } from '../../../src/app/view/groups.ts';
import { peopleIndex, peopleOf } from '../../../src/app/view/people.ts';
import type { AppRun } from '../../../src/app/view/people.ts';
import { chatMessage, recipientOf } from '../../../src/core/messages/messages.ts';
import { editSample, withoutTeams } from '../../helpers.ts';

const sample = readFileSync(join(import.meta.dirname, '../../..', 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const packs = loadPacks();
// The generic tests ask the people of a CI, also on the Business Processes of the sample; the team of reference/record-teams
// (Process Management, D195) has its own tests.
const allReferences = loadReferences();
const references = withoutTeams(allReferences);
const rules = { reminderDays: 3, maxReminders: 2 };

function appRun(csv: string, date: string): AppRun {
  const report = readCiReport(parseCsv(csv));
  const run = buildRun(report.cis, runChecks(report.cis, report.columns, packs, references), packs, date, `${date}.csv`, references);
  return { ...run, people: peopleOf(report.cis, run.facts.map((fact) => fact.ciKey)) };
}

test('every check pack has a short card label', () => {
  for (const pack of packs) assert.ok(pack.cardLabel && pack.cardLabel.length <= 30, `${pack.id} needs a cardLabel`);
});

test('one card per check: red with open problems, grey when not tested, never green when not tested', () => {
  const run = appRun(sample, '2026-11-12');
  const cases = buildCases([run], [], [], '2026-11-12', rules);
  const cards = cardSummaries(packs, run, cases, peopleIndex([run]));
  // A check switched off (status "off") has no card.
  assert.equal(cards.length, checksInUse(packs).length);
  assert.ok(packs.some((pack) => pack.status === 'off') && !cards.some((card) => card.pack.status === 'off'));
  const byId = (id: string) => cards.find((card) => card.id === id)!;
  assert.equal(byId('RESP-MISSING').light, 'red');
  assert.ok(byId('RESP-MISSING').cis > 0 && byId('RESP-MISSING').people > 0);
  // The relationship checks have no detector yet: grey, with the reason.
  assert.equal(byId('REL-MISSING').light, 'grey');
  assert.ok(byId('REL-MISSING').notes.length > 0);
  for (const card of cards) if (!card.tested) assert.equal(card.light, 'grey');
});

test('a card turns green when the next report shows no problem', () => {
  const first = appRun(sample, '2026-11-12');
  const fact = first.facts.find((item) => item.checkId === 'RESP-SAME-PERSON')!;
  let fixed = sample;
  for (const [column, value] of [['managed_by', 'Cy Keeper'], ['managed_by.user_name', 'cy01'], ['managed_by.email', 'cy@example.com']]) fixed = editSample(fixed, fact.ciName, column!, value!);
  const second = appRun(fixed, '2026-11-13');
  const cases = buildCases([first, second], [], [], '2026-11-13', rules);
  const card = cardSummaries(packs, second, cases, peopleIndex([first, second])).find((item) => item.id === 'RESP-SAME-PERSON')!;
  assert.equal(card.light, 'green');
});

test('the lines of a team are one group, the team, with only the team as its people (D195)', () => {
  const report = readCiReport(parseCsv(sample));
  const built = buildRun(report.cis, runChecks(report.cis, report.columns, packs, allReferences), packs, '2026-11-12', 'r.csv', allReferences);
  const run = { ...built, people: peopleOf(report.cis, built.facts.map((fact) => fact.ciKey)) };
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-INACTIVE');
  const settings = { portalLink: '', signature: 'SACM team', teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat', email: 'pat@example.com' }] } } };
  const groups = ownerGroups(cases, peopleIndex([run]), (fact) => recipientOf(fact, settings));
  const team = groups.find((group) => group.team)!;
  assert.deepEqual([team.owner?.name, team.rows.map((row) => row.name), team.people.map((person) => person.email), team.contacts.map((contact) => contact.email)],
    ['Process Management', ['Reconcile Index'], ['pat@example.com'], ['pat@example.com']]);
  assert.ok(groups.filter((group) => !group.team).every((group) => group.rows.every((row) => row.classLabel !== 'Business Process')));
});

test('a card groups its cases by Owned by, with the three roles and every person once', () => {
  const run = appRun(sample, '2026-11-12');
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  const groups = ownerGroups(cases, peopleIndex([run]));
  const nobody = groups.find((group) => !group.owner)!;
  assert.ok(nobody, 'CIs without an owner form their own group');
  for (const group of groups) {
    const ids = group.people.map((person) => person.id);
    assert.equal(new Set(ids).size, ids.length, 'a person is listed once');
    for (const row of group.rows) assert.equal(row.people.owned_by?.id ?? null, group.owner?.id ?? null);
  }
  const withOwner = groups.flatMap((group) => group.rows).find((row) => row.name === 'Close the Month')!;
  assert.ok(withOwner.people.owned_by, 'roles of the CI are shown side by side');
});

test('memory counts emails, reminders and Teams chats once per action', () => {
  const run = appRun(sample, '2026-11-12');
  const keys = run.facts.filter((fact) => fact.checkId === 'RESP-MISSING').map((fact) => fact.key);
  const base = { by: 'lena@example.com', byName: 'Lena', type: 'message' as const, keys };
  const events: CaseEvent[] = [
    { ...base, id: 'a', at: '2026-11-12T09:00:00', ref: 'SACM-AAAAAA', kind: 'first', channel: 'mailbox', to: 'x@example.com' },
    { ...base, id: 'b', at: '2026-11-17T09:00:00', ref: 'SACM-AAAAAA', kind: 'reminder', channel: 'mailbox', to: 'x@example.com' },
    { ...base, id: 'c', at: '2026-11-18T09:00:00', ref: 'SACM-AAAAAA', kind: 'reminder', channel: 'teams', to: 'x@example.com' }
  ];
  const cases = buildCases([run], events, [], '2026-11-18', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  const memory = memoryOf(cases);
  assert.deepEqual([memory.emails, memory.reminders, memory.teams, memory.lastContact], [1, 1, 1, '2026-11-18']);
  assert.ok(cases.every((item) => item.status === 'Contacted'), 'a Teams chat counts as contact');
  // Notes of the team are counted on the group too, so a colleague sees them without opening a CI.
  const noted = buildCases([run], events.concat([{ ...base, type: 'note', id: 'n1', at: '2026-11-12T10:00:00', text: 'first' }, { ...base, type: 'note', id: 'n2', at: '2026-11-13T10:00:00', text: 'second' }]), [], '2026-11-18', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  assert.deepEqual([memoryOf(noted).notes, memoryOf(noted).lastNote?.text], [2, 'second']);
});

test('Teams link: all people, a topic only for a group chat, the message encoded', () => {
  const link = teamsLink(['a@example.com', 'b@example.com'], 'SACM: Owner [SACM-X]', 'Hello & welcome');
  assert.ok(link.startsWith('https://teams.microsoft.com/l/chat/0/0?users=a%40example.com,b%40example.com&topicName='));
  assert.ok(link.endsWith(`&message=${encodeURIComponent('Hello & welcome')}`));
  assert.ok(!teamsLink(['a@example.com'], 'topic', 'hi').includes('topicName'));
  const run = appRun(sample, '2026-11-12');
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  const text = chatMessage(ownerGroups(cases, peopleIndex([run]))[0]!.open, packs, { portalLink: '', signature: 'SACM team' }, 'SACM-X');
  // The same first sentence and ask as the email, with CI names instead of the table.
  assert.match(text, /^Hi, this is the SACM team\. The role [A-Z][a-z]+ by( or [A-Z][a-z]+ by)? is empty\.\n- /);
  assert.match(text, /Could you tell us who it should be\?/);
  assert.match(text, /Reference: SACM-X$/);
});

test('cards: red only for something to solve; waiting and known are counted apart; a review card is never red', () => {
  const run = appRun(sample, '2026-11-12');
  const cases = buildCases([run], [], [], '2026-11-12', rules);
  const cards = cardSummaries(packs, run, cases, peopleIndex([run]));
  const byId = (id: string) => cards.find((card) => card.id === id)!;
  // No criticality reaches the CI: a SACM review card, never red. One known (tagged BIA is pending), one waiting (Inherited set).
  const target = byId('CRIT-NONE-REACHES');
  assert.deepEqual([target.light, target.cis, target.knownCis, target.waitingCis, asideText(target)], ['review', 1, 1, 1, '1 known · 1 waiting']);
  assert.ok(target.main.every((item) => item.state === 'review'));
  // A capability in status Ready is parked (D179): it gives no line, so nothing waits on the card.
  assert.equal(asideText(byId('RESP-MISSING')), '');
  // Above parent: SACM reviews first, so it is not red.
  const above = byId('CRIT-ABOVE-PARENT');
  assert.deepEqual([above.light, above.open.length, above.cis], ['review', 0, 2]);

  // Only known and waiting items left: green, with the counts.
  const fixed = ['x_demo_crit_target_confidentiality', 'x_demo_crit_target_integrity', 'x_demo_crit_target_availability', 'x_demo_crit_target_authenticity']
    .reduce((csv, column) => editSample(csv, 'Event Engine', column, '2'), sample);
  const second = appRun(fixed, '2026-11-13');
  const card = cardSummaries(packs, second, buildCases([run, second], [], [], '2026-11-13', rules), peopleIndex([run, second])).find((item) => item.id === 'CRIT-NONE-REACHES')!;
  assert.deepEqual([card.light, card.open.length, asideText(card)], ['green', 0, '1 known · 1 waiting']);
});

test('long lists: class filter, sort and the export with the columns of the SACM template', () => {
  const run = appRun(sample, '2026-11-12');
  const people = peopleIndex([run]);
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  assert.deepEqual(classesOf(cases), ['Business Capability', 'Business Process', 'Business Service', 'Service Instance'].filter((name) => cases.some((item) => item.fact.classLabel === name)));
  const byOwner = ownerGroups(cases, people, undefined, 'owner');
  // By owner name, the group without an owner last.
  assert.equal(byOwner[byOwner.length - 1]!.owner, null);
  assert.deepEqual(byOwner.filter((group) => group.owner).map((group) => group.owner!.name), byOwner.filter((group) => group.owner).map((group) => group.owner!.name).sort());
  const byCi = ownerGroups(cases, people, undefined, 'ci').map((group) => group.rows[0]!.name);
  assert.deepEqual(byCi, byCi.slice().sort((a, b) => a.localeCompare(b)));

  const csv = exportCsv(cases, people);
  const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(lines[0], '"Name","EPO ID","Class","Owned by","Managed by","Operational status","Support group","Tags","What we found"');
  // One line per CI, several findings joined.
  assert.equal(lines.length - 1, new Set(cases.map((item) => item.fact.ciKey)).size);
  assert.ok(lines.some((line) => line.startsWith('"Manage Fines","AST-0013","Business Capability","","","Operational","","","Owned by is empty; Managed by is empty"')));
  // A cell that Excel could read as a formula is made plain text.
  const risky = cases.slice(0, 1).map((item) => ({ ...item, fact: { ...item.fact, ciName: '=1+1' } }));
  assert.ok(exportCsv(risky, people).includes('"\'=1+1"'));
});

/* ------------------------------------------------------------------ messages and follow-up (version 0.21) */

const stepSettings = { portalLink: '', signature: 'SACM team', ...rules };
const KEY = 'DESC-QUALITY:close the month:description';
const message = (values: Partial<CaseEvent>): CaseEvent => ({ id: `m${values.at}`, by: 'lena@example.com', byName: 'Lena', type: 'message', keys: [KEY], ref: 'SACM-STEP', to: 'dee@example.com', kind: 'first', channel: 'outlook', at: '', ...values });
const DAYS = ['2026-11-12', '2026-11-17', '2026-11-20'];
const stepCase = (events: CaseEvent[], today: string, replies: Reply[] = [], delivery?: Parameters<typeof buildCases>[6]): Case =>
  buildCases([appRun(sample, '2026-11-12')], events, replies, today, rules, undefined, delivery).find((item) => item.key === KEY)!;

test('the next step of a group: first, queued, waiting, reminder, escalate, cannot escalate, answered (F05)', () => {
  const sent = DAYS.map((day, index) => message({ at: `${day}T09:00:00`, kind: index ? 'reminder' : 'first' }));
  const step = (item: Case, today: string) => nextStep({ open: [item] }, today, stepSettings);
  // Nobody was contacted.
  assert.deepEqual(step(stepCase([], '2026-11-12'), '2026-11-12'), { step: 'first' });
  assert.equal(stepWords({ step: 'first' }).button, 'Email');
  // Right after the first message: waiting, never "Email a reminder". The reminder is due three working days later.
  const waiting = step(stepCase(sent.slice(0, 1), '2026-11-12'), '2026-11-12');
  assert.deepEqual(waiting, { step: 'waiting', from: '2026-11-17' });
  assert.deepEqual([stepWords(waiting).button, stepWords(waiting).line, stepWords(waiting).link], ['', 'Waiting for an answer. A reminder is due from 17 Nov.', 'Remind now']);
  // The reminder is due: 1 of 2, then 2 of 2.
  const first = step(stepCase(sent.slice(0, 1), '2026-11-17'), '2026-11-17');
  assert.deepEqual(first, { step: 'reminder', index: 1, of: 2 });
  assert.equal(stepWords(first).button, 'Remind 1 of 2');
  assert.equal(stepWords(step(stepCase(sent.slice(0, 2), '2026-11-20'), '2026-11-20')).button, 'Remind 2 of 2');
  // Three messages and no answer: the escalation names who gets it (Dee's manager, D40).
  const over = stepCase(sent, '2026-11-30');
  const escalate = step(over, '2026-11-30');
  assert.deepEqual(escalate, { step: 'escalate', to: ['Max Manager'], attempts: 3 });
  assert.deepEqual([stepWords(escalate).button, stepWords(escalate).line], ['Escalate to Max Manager', 'No answer after 3 messages.']);
  // Nobody above: an honest "cannot escalate", never a reminder.
  const alone = { ...over, fact: { ...over.fact, escalateEmail: '', escalateName: '' } };
  const cannot = step(alone, '2026-11-30');
  assert.deepEqual(cannot, { step: 'cannot-escalate', about: ['Dee Owner'], attempts: 3 });
  assert.deepEqual([stepWords(cannot).button, stepWords(cannot).line], ['Escalate', 'Nobody is known to escalate to for Dee Owner.']);
  // A reply after the last message.
  const reply: Reply = { ref: 'SACM-STEP', from: 'dee@example.com', received: '2026-11-13T11:00:00', subject: 'RE: [SACM-STEP]', text: 'Hello,\nI will raise the request.', file: 'r1.json' };
  const answered = stepCase(sent.slice(0, 1), '2026-11-20', [reply]);
  assert.deepEqual(step(answered, '2026-11-20'), { step: 'answered' });
  assert.deepEqual([stepWords({ step: 'answered' }).button, stepWords({ step: 'answered' }).link], ['Reply', 'Write again']);
  // A message that waits in the outbox: queued, not contacted, and no reminder however long it waits.
  const queued = stepCase([message({ at: '2026-11-12T09:00:00', channel: 'mailbox', text: 'SACM-STEP_a.json' })], '2026-11-30', [], { queued: new Set(['SACM-STEP_a.json']), sentOn: new Map() });
  assert.deepEqual(step(queued, '2026-11-30'), { step: 'queued', on: '2026-11-12' });
  assert.deepEqual([stepWords({ step: 'queued', on: '2026-11-12' }).button, stepWords({ step: 'queued', on: '2026-11-12' }).line], ['', 'In the outbox since 12 Nov, not sent yet.']);
});

test('the head of a group (L3): one line of memory, one state chip, named after the person asked (D226, D228)', () => {
  const memory = { emails: 0, reminders: 0, teams: 0, lastContact: '', replies: 0, reminderDue: false, overLimit: false, assignedTo: '', notes: 0, lastNote: null };
  assert.equal(memoryWords(memory), 'Not asked yet');
  assert.equal(memoryWords({ ...memory, emails: 1, reminders: 1, teams: 1, lastContact: '2026-11-02T10:00:00' }), 'Asked 3 times · last 2 Nov · no reply');
  assert.equal(memoryWords({ ...memory, emails: 1, lastContact: '2026-11-02', replies: 1 }), 'Asked 1 time · last 2 Nov · 1 reply');
  const group = (over: Partial<Parameters<typeof groupChip>[0]>) => ({ open: [], state: 'open' as const, memory, verifiedOn: '', ...over });
  assert.equal(groupChip(group({}), 'solve'), null);
  assert.equal(groupChip(group({ memory: { ...memory, emails: 1 } }), 'solve')?.word, 'Asked');
  assert.equal(groupChip(group({ memory: { ...memory, emails: 2, reminderDue: true } }), 'solve')?.word, 'Reminder due');
  assert.deepEqual(groupChip(group({ memory: { ...memory, emails: 3, overLimit: true } }), 'solve'), { word: 'To escalate', tone: 'red', icon: 'escalate' });
  assert.equal(groupChip(group({ state: 'closed', verifiedOn: '2026-11-12' }), 'solve')?.word, 'Verified 12 Nov');
  assert.equal(groupChip(group({}), 'waiting')?.word, 'Waiting');
  assert.equal(groupChip(group({}), 'review')?.word, 'To check');
  assert.equal(groupChip(group({ state: 'answered', open: [{ status: 'Fix in progress' } as Case] }), 'solve')?.word, 'In progress');
  assert.equal(statusWord('Contacted'), 'Asked');
  assert.equal(statusWord('Fixed'), 'Marked fixed');
  const contact = { name: 'Cy Keeper', email: 'cy@example.com', via: 'managed by' };
  assert.deepEqual(askedName({ owner: null, contacts: [contact] }), { name: 'Cy Keeper', role: 'Managed by', others: 0, nobody: false, reason: '' });
  assert.deepEqual(askedName({ owner: null, contacts: [], noOwner: 'No Owned by and no Managed by' }), { name: 'Nobody to ask', role: '', others: 0, nobody: true, reason: 'No Owned by and no Managed by' });
  assert.equal(askedName({ owner: null, contacts: [{ ...contact, email: '' }] }).reason, 'No email address');
  assert.equal(askedName({ label: 'End date', owner: null, contacts: [] }).name, 'End date');
});

test('replies to read: until a manager sets a status or writes again; mine first (F07)', () => {
  const sent = message({ at: '2026-11-12T09:00:00' });
  const reply: Reply = { ref: 'SACM-STEP', from: 'dee@example.com', received: '2026-11-13T11:00:00', subject: 'RE: [SACM-STEP]', text: 'Hello,\nI will raise the request.', file: 'r1.json' };
  const list = repliesToRead([stepCase([sent], '2026-11-14', [reply])], 'Lena');
  assert.deepEqual(list.map((line) => [line.file, line.firstLine, line.mine, line.cases.length]), [['r1.json', 'I will raise the request.', false, 1]]);
  // A status set by hand before the reply does not hide it; a status after it does.
  const before: CaseEvent = { ...sent, id: 's0', type: 'status', text: 'Fix in progress', at: '2026-11-12T10:00:00' };
  assert.equal(repliesToRead([stepCase([sent, before], '2026-11-14', [reply])], 'Lena').length, 1);
  const after: CaseEvent = { ...before, id: 's1', at: '2026-11-13T12:00:00' };
  assert.equal(repliesToRead([stepCase([sent, after], '2026-11-14', [reply])], 'Lena').length, 0);
  // Writing again also takes it off the list.
  assert.equal(repliesToRead([stepCase([sent, message({ at: '2026-11-14T08:00:00', kind: 'reminder' })], '2026-11-14', [reply])], 'Lena').length, 0);
  const assigned: CaseEvent = { ...sent, id: 'a1', type: 'assign', text: 'Lena', at: '2026-11-12T09:00:01' };
  assert.equal(repliesToRead([stepCase([sent, assigned], '2026-11-14', [reply])], 'Lena')[0]!.mine, true);
});

test('a reminder with new points is two journal lines and one message on the screen (D161)', () => {
  const run = appRun(sample, '2026-11-12');
  const other = run.facts.find((fact) => fact.contactEmail === 'dee@example.com' && fact.key !== KEY)!.key;
  const first = message({ at: '2026-11-12T09:00:00' });
  const lines: CaseEvent[] = [
    { ...message({ at: '2026-11-17T09:00:00', kind: 'reminder' }), id: 'x1' },
    { ...message({ at: '2026-11-17T09:00:00', kind: 'first' }), id: 'x2', keys: [other] }
  ];
  const shown = oneLinePerMessage([first, ...lines]);
  assert.equal(shown.length, 2);
  assert.deepEqual([shown[1]!.withNew, shown[1]!.event.kind, shown[1]!.event.keys], [true, 'reminder', [KEY, other]]);
  assert.match(describeEvent(shown[1]!.event, new Set(), shown[1]!.withNew).title, /^Reminder with new points to dee@example\.com/);
  // The group counts it once: one email and one reminder, not two reminders or two emails more.
  const cases = buildCases([run], [first, ...lines], [], '2026-11-17', rules).filter((item) => item.key === KEY || item.key === other);
  const memory = memoryOf(cases);
  assert.deepEqual([memory.emails, memory.reminders], [1, 1]);
});

test('the Teams chat has its own text: "answer in this chat", only the CIs of the person asked, nothing said twice (F04)', () => {
  // The chat text of every check with the invented samples, as the recording keeps it.
  const recorded = readFileSync(join(import.meta.dirname, '../..', 'recorded', 'teams-messages.txt'), 'utf8');
  const chats = recorded.split(/^===== /m).filter(Boolean);
  assert.ok(chats.length > 10);
  for (const chat of chats) {
    const id = chat.split('\n')[0];
    assert.ok(!/this e-?mail/i.test(chat), `${id}: the chat says "this email"`);
    const words = chat.split('\n').slice(1).filter((line) => !line.startsWith('- ')).join(' ').replace(/\(https:[^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    // No phrase of two words or more said twice in a row ("in the Service Portal in the Service Portal").
    for (let size = 2; size <= 8; size += 1) for (let at = 0; at + 2 * size <= words.length; at += 1) {
      assert.notEqual(words.slice(at, at + size).join(' '), words.slice(at + size, at + 2 * size).join(' '), `${id}: "${words.slice(at, at + size).join(' ')}" comes twice in a row`);
    }
    for (const sentence of chat.split(/[.?!]\s/)) assert.ok((sentence.match(/in the Service Portal/g) ?? []).length <= 1, `${id}: "in the Service Portal" twice in one sentence`);
  }
  // No message text of a check says "this email" outside the token {reply}.
  for (const pack of packs) assert.ok(!/this e-?mail/i.test(JSON.stringify(pack.playbook.message ?? {})), `${pack.id}: write {reply}`);
  // Only the CIs this person is asked about.
  const run = appRun(sample, '2026-11-12');
  const all = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.contactEmail && packs.find((pack) => pack.id === item.fact.checkId)?.playbook.message);
  const shared = Array.from(new Set(all.map((item) => item.fact.checkId))).find((id) => new Set(all.filter((item) => item.fact.checkId === id).map((item) => item.fact.contactEmail)).size >= 2)!;
  const cases = all.filter((item) => item.fact.checkId === shared);
  const people = Array.from(new Set(cases.map((item) => item.fact.contactEmail))).filter(Boolean);
  assert.ok(people.length >= 2, 'the sample asks two people on this card');
  for (const email of people) {
    const text = chatMessage(cases, packs, { portalLink: '', signature: 'SACM team' }, 'SACM-X', email);
    for (const item of cases) assert.equal(text.split('\n').includes(`- ${item.fact.ciName}`), cases.some((one) => one.fact.ciName === item.fact.ciName && one.fact.contactEmail === email), `${item.fact.ciName} in the chat of ${email}`);
  }
  const email = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  assert.match(chatMessage(email, packs, { portalLink: '', signature: 'SACM team' }, 'SACM-X'), /answer in this chat/);
});

test('the kind of a card comes from fields the check files already have (D167)', () => {
  const kindOf = (id: string) => cardKind(packs.find((pack) => pack.id === id)!);
  assert.equal(kindOf('RESP-MISSING'), 'owners');
  assert.equal(kindOf('CRIT-ABOVE-PARENT'), 'owners');
  assert.equal(kindOf('REL-TWICE'), 'fix');
  assert.equal(kindOf('REL-ONE-TO-ONE'), 'fix');
  // The card SACM fixes itself (D74, D170).
  assert.equal(kindOf('NAME-HIDDEN-CHAR'), 'fix');
  // A review list wins over the fix path: nothing is marked on it.
  assert.equal(kindOf('CRIT-NONE-REACHES'), 'review');
  assert.equal(kindOf('EPO-NOT-ARRIVED'), 'review');
  assert.equal(kindOf('CONTRACT-PROCUREMENT'), 'mailbox');
  // The mapping backlog: one case per CI, with its stage (D200).
  assert.equal(kindOf('MAPPING'), 'mapping');
  const counts = { owners: 0, fix: 0, review: 0, mailbox: 0, mapping: 0 };
  for (const pack of checksInUse(packs)) counts[cardKind(pack)] += 1;
  // The lifecycle review is a SACM line first since D192.
  assert.equal(kindOf('LIFECYCLE-REVIEW'), 'fix');
  // SACM sets the process type tag, and moves a process in Ready on (D197, D198).
  assert.equal(kindOf('TAG-MISSING'), 'fix');
  assert.equal(kindOf('PROCESS-STAGE'), 'fix');
  assert.deepEqual(counts, { owners: 14, fix: 21, review: 2, mailbox: 1, mapping: 1 });
});

test('a fix list with every line marked as fixed waits for the next report, and still counts as to solve (D168)', () => {
  const run = appRun(sample, '2026-11-12');
  const fixPack = { ...packs.find((pack) => pack.id === 'RESP-SAME-PERSON')!, playbook: { path: 'sacm-fix', audience: ['sacm'] } };
  const own = packs.map((pack) => (pack.id === fixPack.id ? fixPack : pack));
  const keys = run.facts.filter((fact) => fact.checkId === fixPack.id).map((fact) => fact.key);
  assert.ok(keys.length >= 1);
  const mark = (id: string, list: string[], text = 'Fixed'): CaseEvent => ({ id, at: `2026-11-12T10:0${id.length}:00Z`, by: 'ana@example.com', byName: 'Ana', type: 'status', keys: list, text });
  const cardOf = (events: CaseEvent[]) => cardSummaries(own, run, buildCases([run], events, [], '2026-11-12', rules), peopleIndex([run])).find((card) => card.id === fixPack.id)!;
  const none = cardOf([]);
  assert.equal(none.light, 'red');
  assert.deepEqual(fixProgress(none), { lines: keys.length, marked: 0 });
  const all = cardOf([mark('a', keys)]);
  assert.equal(all.light, 'marked');
  assert.deepEqual(fixProgress(all), { lines: keys.length, marked: keys.length });
  // The numbers of the first screen do not move: the lines are to solve until a later report (D59).
  assert.deepEqual(cardTotals([all]), cardTotals([none]));
  assert.equal(cardOf([mark('a', keys), mark('bb', keys.slice(0, 1), 'New')]).light, 'red');
  // The same marks on a card where people are asked change nothing.
  assert.equal(cardSummaries(packs, run, buildCases([run], [mark('a', keys)], [], '2026-11-12', rules), peopleIndex([run])).find((card) => card.id === fixPack.id)!.light, 'red');
});

test('a card says on how many CIs it was tested; the lines of a fix list group by class', () => {
  const run = appRun(sample, '2026-11-12');
  assert.ok((testedOn({ id: 'RESP-MISSING' }, run) ?? 0) > 0);
  assert.equal(testedOn({ id: 'RESP-MISSING' }, { evaluated: {} }), null);
  assert.equal(testedOn({ id: 'RESP-MISSING' }, undefined), null);
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING');
  const groups = fixGroups(fixRows(cases));
  assert.ok(groups.length > 1);
  assert.deepEqual(groups.map((group) => group.name), groups.map((group) => group.name).slice().sort((a, b) => a.localeCompare(b)));
  assert.equal(groups.reduce((sum, group) => sum + group.rows.length, 0), cases.length);
  const oneClass = cases.filter((item) => item.fact.classLabel === cases[0]!.fact.classLabel);
  assert.deepEqual(fixGroups(fixRows(oneClass)).map((group) => group.name), ['']);
  assert.deepEqual(fixGroups([]), []);
});

test('a fix list shows one record per CI with every change to make on it, and what is still to mark (D242)', () => {
  const run = appRun(sample, '2026-11-12');
  const all = buildCases([run], [], [], '2026-11-12', rules);
  const cases = all.filter((item) => item.fact.checkId === 'RESP-MISSING' && item.state === 'open');
  const records = fixRecords(fixRows(cases));
  assert.ok(records.length < cases.length, 'some CI has more than one change');
  assert.equal(records.reduce((sum, one) => sum + one.rows.length, 0), cases.length);
  assert.equal(new Set(records.map((one) => one.key)).size, records.length);
  assert.ok(records.every((one) => one.rows.every((row) => row.item.fact.ciKey === one.key) && one.open.length === one.rows.length && !one.marked.length));
  // The values to copy come from the fix lines; an instruction has none.
  const names = fixRows(all.filter((item) => item.fact.checkId === 'NAME-DUPLICATE'));
  assert.ok(names.some((row) => row.value && row.value === row.set) && names.some((row) => !row.value && row.set));
  const first = records.find((one) => one.rows.length > 1)!;
  const marks: CaseEvent[] = [{ id: 'm', at: '2026-11-12T10:00:00Z', by: 'ana@example.com', byName: 'Ana', type: 'status', keys: [first.rows[0]!.item.key], text: 'Fixed' },
    { id: 'n', at: '2026-11-12T10:01:00Z', by: 'ana@example.com', byName: 'Ana', type: 'assign', keys: first.open, text: 'Ana' }];
  const again = fixRecords(fixRows(buildCases([run], marks, [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING' && item.state === 'open'))).find((one) => one.key === first.key)!;
  assert.deepEqual([again.marked.length, again.open.length, again.assignedTo], [1, first.rows.length - 1, 'Ana']);
});

test('the group "nobody" is split by reason, and a group shows its status in words (F24, F37)', () => {
  const run = appRun(sample, '2026-11-12');
  const cases = buildCases([run], [], [], '2026-11-12', rules).filter((item) => item.fact.checkId === 'RESP-MISSING' && item.state === 'open');
  const groups = ownerGroups(cases, peopleIndex([run]));
  const without = groups.filter((group) => !group.owner);
  assert.ok(without.length >= 2, 'the invented sample has CIs without owner for two reasons');
  assert.equal(new Set(without.map((group) => group.noOwner)).size, without.length);
  for (const group of without) for (const item of group.cases) assert.equal(noOwnerReason(item, undefined, peopleIndex([run]).get(item.fact.ciKey)), group.noOwner);
  assert.ok(without.some((group) => group.noOwner === 'No Owned by and no Managed by' && !group.contacts.length));
  assert.ok(groups.filter((group) => group.owner).every((group) => group.noOwner === undefined));
  const open = cases.slice(0, 2);
  const withStatus = (statuses: string[]) => ({ state: 'answered' as const, open: open.map((item, index) => ({ ...item, status: statuses[index]! })) as Case[] });
  assert.equal(groupStatusWord(withStatus(['Fix in progress', 'Fix in progress'])), 'Fix in progress');
  assert.equal(groupStatusWord(withStatus(['Answered', 'Fix in progress'])), 'Answered, Fix in progress');
  assert.equal(groupStatusWord({ state: 'open', open }), '');
});

test('Activity names every card of a line, or counts them (F08)', () => {
  assert.equal(cardWords(['Description', 'Description', 'Tag missing']), 'Description, Tag missing');
  assert.equal(cardWords(['A', 'B', 'C', 'D']), '4 cards');
  assert.equal(cardWords([]), '');
});
