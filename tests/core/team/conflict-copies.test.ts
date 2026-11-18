import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, copiesOf, copyName, isCopyOf, tidyJournals, tidyRuns } from '../../../src/core/team/conflict-copies.ts';
import { parseJournal, writeJournal } from '../../../src/core/memory/memory.ts';
import type { CaseEvent } from '../../../src/core/cases/cases.ts';

const ev = (id: string, by: string, at: string): CaseEvent => ({ id, at, by, byName: by, type: 'note', keys: ['k'] });

test('conflict copies are known by their name, the way OneDrive names them', () => {
  assert.equal(isCopyOf('settings-PC01.json', 'settings.json'), true);
  assert.equal(isCopyOf('settings (1).json', 'settings.json'), true);
  assert.equal(isCopyOf('settings.json', 'settings.json'), false);
  assert.equal(isCopyOf('settings.1a2b3c4d.json', 'settings.json'), false);
  assert.equal(isCopyOf('settingsx.json', 'settings.json'), false);
  assert.equal(isCopyOf('state-PC01.json', 'settings.json'), false);
  assert.deepEqual(copiesOf(['settings.json', 'state.json', 'settings-PC-B.json', 'team.json'], 'settings.json'), ['settings-PC-B.json']);
  assert.equal(copyName('settings.json', 'abc'), `settings.${contentHash('abc')}.json`);
  assert.equal(contentHash('abc'), contentHash('abc'));
  assert.notEqual(contentHash('abc'), contentHash('abd'));
});

test('two loads of the same report: one is kept, the copy goes to the archive, the same on both computers', () => {
  const run = (loadedAt?: string): string => JSON.stringify({ date: '2026-11-12', report: 'cmdb_ci.csv', facts: [], ...(loadedAt ? { loadedAt } : {}) });
  const canonical = '2026-11-12_cmdb_ci.csv.json';
  // Version 0.10 wrote who and when into the run: the one loaded first stays, even when it is the copy.
  const files = [{ name: canonical, text: run('2026-11-12T08:55:09') }, { name: '2026-11-12_cmdb_ci.csv-PC-B.json', text: run('2026-11-12T08:55:01') }];
  const tidy = tidyRuns(files);
  assert.deepEqual(tidy.write, [{ name: canonical, text: files[1]!.text }]);
  assert.deepEqual(tidy.archive.map((item) => [item.name, item.to]).sort(), [['', copyName(canonical, files[0]!.text)], ['2026-11-12_cmdb_ci.csv-PC-B.json', copyName(canonical, files[1]!.text)]].sort());
  assert.deepEqual(tidy.notes, [canonical]);
  // The other computer lists the files in another order: the same result.
  assert.deepEqual(tidyRuns(files.slice().reverse()), tidy);
  // Same bytes: the copy goes, nothing is rewritten.
  const same = tidyRuns([{ name: canonical, text: run() }, { name: '2026-11-12_cmdb_ci.csv-PC-B.json', text: run() }]);
  assert.deepEqual(same.write, []);
  assert.deepEqual(same.archive.map((item) => item.name), ['2026-11-12_cmdb_ci.csv-PC-B.json']);
  // Nothing to tidy.
  assert.deepEqual(tidyRuns([{ name: canonical, text: run() }, { name: '2026-11-11_cmdb_ci.csv.json', text: JSON.stringify({ date: '2026-11-11', report: 'cmdb_ci.csv', facts: [] }) }]), { write: [], archive: [], notes: [] });
});

test('a journal written on two computers: the copy is folded in, each event once, and archived', () => {
  const mine = writeJournal([ev('a', 'ana@example.com', '2026-11-12T09:00:00'), ev('b', 'ana@example.com', '2026-11-12T09:05:00')]);
  const copy = writeJournal([ev('a', 'ana@example.com', '2026-11-12T09:00:00'), ev('c', 'ana@example.com', '2026-11-12T09:06:00')]);
  const other = writeJournal([ev('p', 'oskar@example.com', '2026-11-12T09:00:00')]);
  const files = [{ name: 'ana_example.com.jsonl', text: mine }, { name: 'ana_example.com-PC-B.jsonl', text: copy }, { name: 'oskar_example.com.jsonl', text: other }];
  const tidy = tidyJournals(files);
  assert.equal(tidy.write.length, 1);
  assert.equal(tidy.write[0]!.name, 'ana_example.com.jsonl');
  assert.deepEqual(parseJournal(tidy.write[0]!.text).map((event) => event.id), ['a', 'b', 'c']);
  assert.deepEqual(tidy.archive, [{ name: 'ana_example.com-PC-B.jsonl', to: copyName('ana_example.com.jsonl', copy), text: copy }]);
  assert.deepEqual(tidyJournals(files.slice().reverse()), tidy);
  // Without a copy nothing is written.
  assert.deepEqual(tidyJournals([files[0]!, files[2]!]), { write: [], archive: [], notes: [] });
});
