import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record } from '../../../src/app/state/journal.ts';
import { saveSettings } from '../../../src/app/state/settings.ts';
import { applyShareOut, colleagueContacts, handOver, openPerson, recheckColleagues, saveTeam, shareOutPlan, teamNames } from '../../../src/app/state/team.ts';
import { state } from '../../../src/app/state/store.ts';
import { parseJournal } from '../../../src/core/memory/memory.ts';
import { ownerGroups } from '../../../src/app/view/groups.ts';
import { toSolve } from '../../../src/app/view/cases.ts';
import { COLLEAGUE, TEST_USER, loadTheSamples, nextSecond, openFolder, useRepositoryContent } from './helpers.ts';

/* Working together and the team settings, with the in-memory folder. */

useRepositoryContent();

test('the team list is saved in data/team.json, and the change is a journal line', async () => {
  const workspace = await openFolder();
  await saveTeam([TEST_USER, COLLEAGUE]);
  assert.deepEqual(JSON.parse(await workspace.readText('data/team.json')), { version: 1, members: [COLLEAGUE, TEST_USER] });
  assert.ok(state.events.some((event) => event.type === 'settings'));
  assert.deepEqual(teamNames().sort(), [COLLEAGUE.name, TEST_USER.name].sort());
});

test('a change of the team settings is saved and recorded with the old and the new value', async () => {
  const workspace = await openFolder();
  await saveSettings({ ...TEST_USER }, { ...state.settings, reminderDays: 5 });
  assert.equal(JSON.parse(await workspace.readText('data/settings.json')).reminderDays, 5);
  const line = state.events.filter((event) => event.type === 'settings').pop()!;
  assert.equal(line.text, 'Team settings changed. Working days before a reminder is due: 3 → 5');
  assert.equal(state.askUser, false);
});

test('a known email gets the name of the team list, so one person never becomes two', async () => {
  await openFolder();
  await saveTeam([TEST_USER, COLLEAGUE]);
  await saveSettings({ name: 'alex', email: 'ALEX.example@example.com' }, null);
  assert.equal(state.user.name, COLLEAGUE.name);
});

test('Share out this card gives each group nobody has taken to a team member, and Hand over gives my open work away', async () => {
  await openFolder();
  await saveTeam([TEST_USER, COLLEAGUE]);
  await loadTheSamples();
  const card = state.cases.filter((item) => item.fact.checkId === 'RESP-MISSING' && toSolve(item));
  const groups = ownerGroups(card, state.people).map((group) => ({ key: group.key, keys: group.open.map((item) => item.key), size: group.open.length }));
  const plan = shareOutPlan(groups);
  assert.equal(plan.size, groups.length);
  await applyShareOut(groups, plan);
  for (const group of groups) for (const key of group.keys) assert.equal(state.cases.find((item) => item.key === key)?.assignedTo, plan.get(group.key));
  const mine = state.cases.filter((item) => item.assignedTo === TEST_USER.name).length;
  assert.ok(mine > 0);
  await nextSecond();
  assert.equal(await handOver(COLLEAGUE.name, 'On holiday'), mine);
  assert.equal(state.cases.filter((item) => item.assignedTo === TEST_USER.name).length, 0);
});

test('before writing to someone, a colleague\'s message of a minute ago is found in their journal', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const item = state.cases.find(toSolve)!;
  const at = new Date().toISOString().slice(0, 19);
  const month = at.slice(0, 7);
  const theirs = { id: 'colleague-1', at, by: COLLEAGUE.email, byName: COLLEAGUE.name, type: 'message', keys: [item.key], to: item.fact.contactEmail, ref: 'SACM-OTHER1', channel: 'mailbox' };
  await workspace.writeText(`data/journal/${month}/alex.example_example.com.jsonl`, `${JSON.stringify(theirs)}\n`);
  assert.equal(colleagueContacts([item.fact.contactEmail], [item.key]).length, 0);
  await recheckColleagues();
  const found = colleagueContacts([item.fact.contactEmail], [item.key]);
  assert.equal(found.length, 1);
  // My own journal is not read again, and nothing was written to it.
  await record('note', [item.key], { text: 'Checked' });
  const mine = parseJournal(await workspace.readText(`data/journal/${month}/test.manager_example.com.jsonl`));
  assert.ok(mine.every((event) => event.by === TEST_USER.email));
});

test('the page of a person remembers where it was opened from', async () => {
  await openFolder();
  state.view = 'mywork';
  openPerson('someone@example.com');
  assert.equal(state.view, 'person');
  assert.equal(state.backTo, 'mywork');
  openPerson('other@example.com');
  assert.equal(state.backTo, 'mywork');
});

test('a save that changes nothing writes nothing: no file, no line in Activity (F54)', async () => {
  const workspace = await openFolder();
  const before = state.events.filter((event) => event.type === 'settings').length;
  await saveSettings({ ...TEST_USER }, { ...state.settings, requests: { 'owned-by-update': { name: 'Owned by - update', link: '' } } });
  assert.equal(state.events.filter((event) => event.type === 'settings').length, before);
  assert.equal((await workspace.list('data')).some((file: { name: string }) => file.name === 'settings.json'), false);
});
