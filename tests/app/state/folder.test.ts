import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeFolderNotes, refresh, start } from '../../../src/app/state/folder.ts';
import { state } from '../../../src/app/state/store.ts';
import { parseJournal } from '../../../src/core/memory/memory.ts';
import { RECORD_DATE } from '../../sample-record.ts';
import { TEST_USER, loadTheSamples, openFolder, useRepositoryContent } from './helpers.ts';

/* Opening the team folder and reading it again, with the in-memory folder. */

useRepositoryContent();
const caseView = (): string => JSON.stringify(state.cases.map((item) => [item.key, item.status, item.state, item.assignedTo]));

test('a team folder opened again shows the same cases (what another computer sees after the sync)', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const before = caseView();
  const summary = await workspace.readText('data/state.json');
  assert.ok(summary.length > 0, 'data/state.json is written when a report is loaded');
  // Somebody opens the same folder: a new start on the same files.
  state.cases = [];
  await start(workspace, 'folder');
  assert.equal(caseView(), before);
  // Reading the folder again writes nothing new.
  await refresh();
  assert.equal(await workspace.readText('data/state.json'), summary);
});

test('journals of version 0.5 and older (one file per person) are split into months', async () => {
  const workspace = await openFolder();
  const old = [
    { id: 'a1', at: '2026-10-30T09:00:00', by: TEST_USER.email, byName: TEST_USER.name, type: 'note', keys: ['X'], text: 'October' },
    { id: 'a2', at: '2026-11-02T09:00:00', by: TEST_USER.email, byName: TEST_USER.name, type: 'note', keys: ['X'], text: 'November' }
  ];
  await workspace.writeText('data/journal/test.manager_example.com.jsonl', old.map((event) => JSON.stringify(event)).join('\n'));
  await refresh();
  assert.equal((await workspace.list('data/journal')).length, 0);
  assert.deepEqual(parseJournal(await workspace.readText('data/journal/2026-10/test.manager_example.com.jsonl')).map((event) => event.text), ['October']);
  assert.deepEqual(parseJournal(await workspace.readText('data/journal/2026-11/test.manager_example.com.jsonl')).map((event) => event.text), ['November']);
  assert.equal(state.events.length, 2);
});

test('a conflict copy of the settings is moved to the archive, never deleted, and the team is told', async () => {
  const workspace = await openFolder();
  await workspace.writeText('data/settings.json', JSON.stringify({ ...state.settings, reminderDays: 4 }));
  await workspace.writeText('data/settings-PC01.json', JSON.stringify({ ...state.settings, reminderDays: 5 }));
  await refresh();
  assert.equal(state.settings.reminderDays, 4);
  assert.deepEqual((await workspace.list('data')).map((file) => file.name).filter((name) => /settings/.test(name)), ['settings.json']);
  const month = state.readAt.slice(0, 7);
  const kept = await workspace.list(`data/archive/${month}/conflicts`);
  assert.equal(kept.length, 1);
  assert.match(await workspace.readText(`data/archive/${month}/conflicts/${kept[0]!.name}`), /"reminderDays":5/);
  assert.ok(state.folderNotes.includes('The team settings were changed on two computers at the same time. Please check Settings.'));
  closeFolderNotes();
  assert.deepEqual(state.folderNotes, []);
});

test('two loads of the same report on two computers keep one load', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const file = `${RECORD_DATE}_cmdb_rel_ci-sample.csv.json`;
  const text = await workspace.readText(`data/runs/relationships/${file}`);
  await workspace.writeText(`data/runs/relationships/${file.replace('.json', '-PC01.json')}`, text);
  await refresh();
  assert.deepEqual((await workspace.list('data/runs/relationships')).map((item) => item.name), [file]);
  assert.ok(state.folderNotes.some((note) => /was loaded on two computers at the same moment/.test(note)), state.folderNotes.join('\n'));
});

test('the runs beyond the last 10 move to the archive and still count in the summary', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const run = await workspace.readText(`data/runs/${RECORD_DATE}_cmdb_ci-sample.csv.json`);
  for (let day = 1; day <= 11; day += 1) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    await workspace.writeText(`data/runs/${date}_cmdb_ci-sample.csv.json`, run.replace(/"date":"2026-11-11"/, `"date":"${date}"`));
  }
  await refresh();
  assert.equal((await workspace.list('data/runs')).filter((file) => /\.json$/.test(file.name)).length, 10);
  assert.equal((await workspace.list('data/archive/2026-10')).length, 2);
  assert.equal(state.runs.length, 10);
});
