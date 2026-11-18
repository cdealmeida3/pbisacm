import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start } from '../../../src/app/state/folder.ts';
import { loadLatestReport, loadSources, removeLoad, runChecksAgain, startDemo } from '../../../src/app/state/loading.ts';
import { cardSummaries, cardTotals, sectionText } from '../../../src/app/view/cards.ts';
import { changedAfterChecks, changedAfterChecksText, reportTiles } from '../../../src/app/view/tiles.ts';
import { MODULES } from '../../../src/core/model/model.ts';
import { loadPacks } from '../../../src/hosts/cli.ts';
import { latestRun, state } from '../../../src/app/state/store.ts';
import { MemoryWorkspace } from '../../../src/app/platform/workspace.ts';
import { RECORD_DATE } from '../../sample-record.ts';
import { EARLIER, TEST_USER, loadTheSamples, openFolder, sampleSource, useRepositoryContent } from './helpers.ts';

/*
 * Loading reports, as the buttons do it, with the in-memory folder. The strongest check: the five invented reports, loaded
 * through the app's own actions, save exactly the run that the recorded result holds (tests/recorded/run.json).
 */

useRepositoryContent();
const recorded = (file: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, '../../recorded', file), 'utf8'));

test('loading the five invented reports saves exactly the recorded run', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const saved = JSON.parse(await workspace.readText(`data/runs/${RECORD_DATE}_cmdb_ci-sample.csv.json`));
  assert.deepEqual(saved, recorded('run.json'));
  assert.equal(state.runs.length, 1);
  assert.equal(state.relationship?.report, 'cmdb_rel_ci-sample.csv');
  assert.equal(state.epo?.report, 'epo-systems-sample.csv');
  assert.equal(state.contracts?.report, 'servicenow-contracts-sample.csv');
  assert.equal(state.solusi?.date, RECORD_DATE);
  assert.equal(state.solusiPrevious?.date, EARLIER);
  // Each kind in its own folder of data/runs/.
  for (const folder of ['data/runs/relationships', 'data/runs/epo', 'data/runs/contracts']) assert.equal((await workspace.list(folder)).length, 1, folder);
  assert.equal((await workspace.list('data/runs/solusi')).length, 2);
  assert.ok(state.cases.length > 0 && state.groups.length > 0);
});

test('who loaded a report is in the journal, never in the run file', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const run = await workspace.readText(`data/runs/${RECORD_DATE}_cmdb_ci-sample.csv.json`);
  assert.ok(!run.includes(TEST_USER.email) && !run.includes(TEST_USER.name));
  const month = (await workspace.listFolders('data/journal'))[0]!;
  const journal = await workspace.readText(`data/journal/${month}/test.manager_example.com.jsonl`);
  assert.match(journal, /Loaded the CI report cmdb_ci-sample\.csv \(report of 2026-11-11\)/);
  assert.equal(latestRun()?.loadedByName, TEST_USER.name);
});

test('the Reports strip says what each load holds', async () => {
  await openFolder();
  await loadTheSamples();
  assert.ok(state.loadMessages.some((line) => /^cmdb_ci-sample\.csv \(CI report of 11 Nov 2026\): \d+ CIs checked\..* \d+ findings to solve on \d+ cards\./.test(line)), state.loadMessages.join('\n'));
  assert.ok(state.loadMessages.some((line) => /^cmdb_rel_ci-sample\.csv \(Relationship report of 11 Nov 2026\): \d+ relationships\./.test(line)));
  // Loaded with a CI report: no "load the CI report again".
  assert.ok(state.loadMessages.every((line) => !/load the CI report again/.test(line)));
});

test('a file that is not a known report is named, and nothing is saved', async () => {
  const workspace = await openFolder();
  await loadSources([{ name: 'notes.csv', path: '', date: RECORD_DATE, bytes: async () => new TextEncoder().encode('Colour,Size\nred,big\n') }]);
  assert.equal(state.loadMessages.length, 1);
  assert.match(state.loadMessages[0]!, /^notes\.csv: /);
  assert.equal((await workspace.list('data/runs')).length, 0);
  assert.equal(state.toast, 'No report was loaded. See the message under Reports.');
});

test('Load latest report takes the newest report of each type once, and says when it is already loaded', async () => {
  const workspace = await openFolder();
  for (const name of ['cmdb_ci-sample.csv', 'cmdb_rel_ci-sample.csv']) await workspace.writeText(`reports/${RECORD_DATE}_${name}`, readFileSync(join(import.meta.dirname, '../../../samples', name), 'utf8'));
  await loadLatestReport();
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0]!.date, RECORD_DATE);
  assert.ok(state.relationship);
  await loadLatestReport();
  assert.equal(state.toast, 'Nothing new to load');
  assert.ok(state.loadMessages.some((line) => /^The newest CI report, reports\/2026-11-11_cmdb_ci-sample\.csv \(report of 11 Nov 2026\), is already loaded by Test Manager/.test(line)), state.loadMessages.join('\n'));
  assert.equal((await workspace.list('data/runs')).length, 1);
});

test('Remove this load moves the run to the archive, never deletes it, and the journal says who', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  await removeLoad('relationship');
  assert.equal(state.relationship, null);
  assert.equal((await workspace.list('data/runs/relationships')).length, 0);
  const month = RECORD_DATE.slice(0, 7);
  assert.deepEqual((await workspace.list(`data/archive/${month}/removed`)).map((file) => file.name), [`${RECORD_DATE}_cmdb_rel_ci-sample.csv.json`]);
  assert.ok(state.events.some((event) => event.type === 'report' && event.text === `Removed the load of cmdb_rel_ci-sample.csv (report of ${RECORD_DATE})`));
  assert.deepEqual(state.loadMessages, [`Removed the load of cmdb_rel_ci-sample.csv (report of 11 Nov 2026). It is kept in data/archive/${month}/removed/.`]);
});

test('nothing is written without a name and an email', async () => {
  const workspace = new MemoryWorkspace('Team folder');
  state.user = { name: '', email: '' };
  await start(workspace, 'folder');
  assert.equal(state.askUser, true);
  await loadSources([sampleSource('cmdb_rel_ci-sample.csv', RECORD_DATE)]);
  assert.equal((await workspace.listFolders('data/journal')).length, 0);
  assert.equal(state.toast.length > 0, true);
});

test('the demo loads every invented report, with the Solusi file of a week earlier', async () => {
  state.user = { name: '', email: '' };
  await startDemo();
  assert.equal(state.mode, 'demo');
  assert.equal(state.user.email, 'demo.user@example.com');
  assert.equal(state.runs.length, 1);
  assert.ok(state.relationship && state.epo && state.solusi && state.contracts && state.solusiPrevious);
  assert.equal(state.team.length, 3);
  assert.deepEqual(state.loadMessages, []);
  assert.ok(state.cases.some((item) => item.state === 'open'));
});

test('in the demo a real file replaces the invented data, and nothing is saved', async () => {
  state.user = { name: '', email: '' };
  await startDemo();
  await loadSources([sampleSource('cmdb_rel_ci-sample.csv', RECORD_DATE)]);
  assert.equal(state.mode, 'files');
  assert.equal(state.workspace?.label, 'Report files only (nothing is saved)');
  assert.equal(state.runs.length, 0);
  assert.ok(state.relationship);
  // The picked file is kept in memory, so Pick reports lists it again.
  assert.equal((await state.workspace!.list('reports')).map((file) => file.name).join(), 'cmdb_rel_ci-sample.csv');
});

/** The cards of the overview, as the app builds them. */
const overviewCards = () => cardSummaries(loadPacks(), latestRun(), state.cases, state.people, state.relationship?.relationships.length, state.epo?.systems.length, !!state.solusi && !!state.contracts);

test('one meaning for each number: the CI report tile, the load message and the sections count the same findings (F10)', async () => {
  await openFolder();
  await loadTheSamples();
  const cards = overviewCards();
  const tile = reportTiles(latestRun(), state.relationship, RECORD_DATE, 7, state.epo, state.epoPrevious, state.solusi, state.contracts, state.solusiPrevious, cardTotals(cards))[0]!;
  const tileNumber = Number(/· ([\d,]+) findings? to solve( · [\d,]+ to clarify when there is time)?$/.exec(tile.load!.summary)![1]!.replace(/,/g, ''));
  // The sections count cards, not findings (D219): the findings of their cards add up to the number of the tile.
  const sectionNumber = MODULES.reduce((sum, module) => sum + cardTotals(cards.filter((card) => card.module === module)).findings, 0);
  assert.ok(tileNumber > 0);
  assert.equal(tileNumber, sectionNumber);
  const message = state.loadMessages.filter((line) => /^cmdb_ci-sample\.csv/.test(line))[0]!;
  assert.match(message, new RegExp(`${tileNumber} findings to solve on`));
  // The cards to clarify when there is time are counted apart, the same on the tile and in the load message (D182).
  const later = cardTotals(cards).laterFindings;
  assert.ok(later > 0);
  assert.ok(tile.load!.summary.endsWith(` · ${later} to clarify when there is time`), tile.load!.summary);
  assert.match(message, new RegExp(`\\. ${later} to clarify when there is time\\.`));
  // The parked classes are said in the load message (D179).
  assert.match(message, /No API or Application CIs in this report\./);
});

test('a section counts its cards by state, "All OK" only when every card was tested and none is to solve or to check (D219)', () => {
  const card = (light: string, open = 0, later = false) => ({ light, later, open: new Array(open).fill(null), waiting: [], known: [], review: [] }) as unknown as Parameters<typeof sectionText>[0][number];
  assert.deepEqual(sectionText([card('green'), card('green')]), { text: 'All OK', tone: 'green' });
  assert.deepEqual(sectionText([card('green'), card('grey'), card('grey')]), { text: '2 not tested', tone: 'grey' });
  assert.deepEqual(sectionText([card('red', 1), card('grey')]), { text: '1 to solve · 1 not tested', tone: 'red' });
  assert.deepEqual(sectionText([card('red', 3), card('red', 1), card('review'), card('marked', 2), card('red', 2, true), card('grey')]),
    { text: '2 to solve · 1 to check · 1 marked fixed · 1 when there is time · 1 not tested', tone: 'red' });
});

test('removing the EPO load shows that the cards are old; Run the checks again makes the EPO cards grey (F12, F13)', async () => {
  await openFolder();
  await loadTheSamples();
  assert.deepEqual(changedAfterChecks(latestRun(), state.relationship, state.epo, state.solusi, state.contracts), []);
  await removeLoad('epo');
  const changed = changedAfterChecks(latestRun(), state.relationship, state.epo, state.solusi, state.contracts);
  assert.deepEqual(changed, ['EPO systems report']);
  assert.equal(changedAfterChecksText(changed), 'The EPO systems report changed after the checks ran. The cards still show the old result.');
  // The EPO cards still show the old result until the button is pressed.
  assert.equal(overviewCards().filter((card) => card.pack.family === 'epo-report').some((card) => card.light !== 'grey'), true);
  await runChecksAgain();
  assert.deepEqual(changedAfterChecks(latestRun(), state.relationship, state.epo, state.solusi, state.contracts), []);
  const epoCards = overviewCards().filter((card) => card.pack.family === 'epo-report');
  assert.ok(epoCards.length > 0);
  for (const epoCard of epoCards) {
    assert.equal(epoCard.light, 'grey', epoCard.id);
    assert.match(epoCard.notes.join(' '), /no EPO systems report/i);
  }
  assert.ok(state.loadMessages.every((line) => !/load the CI report again/i.test(line)));
});
