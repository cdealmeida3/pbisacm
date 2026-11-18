// The answer key of the actions of each case (build B6, D294): tools/powerbi/actions.ts, on the invented samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askWords, lineActionIds } from '../../../tools/powerbi/actions.ts';
import { caseLines, historyKey } from '../../../tools/powerbi/history.ts';

test('askWords keeps the words after the last colon, with a capital letter', () => {
  assert.equal(askWords('Cannot tell which one is right: ask the owner'), 'Ask the owner');
  assert.equal(askWords('Ask the owner'), 'Ask the owner');
});

test('every case of the samples can get a note; a closed case can get no status, assignment or request', async () => {
  const lines = caseLines(await historyKey());
  assert.ok(lines.length > 0);
  const known = new Set(lineActionIds());
  for (const line of lines) {
    const ids = String(line.Actions).split('|').map((pair) => pair.split('=')[0]!);
    assert.equal(ids[0], 'note', `${line.Key}: ${line.Actions}`);
    for (const id of ids) assert.ok(known.has(id), `${line.Key}: ${id} is no action of the catalogue`);
    if (line.Status === 'Verified' || line.Status === 'Not followed up') for (const id of ['status', 'assign', 'request']) assert.ok(!ids.includes(id), `${line.Key}: ${id} on a closed case`);
  }
  // The samples have a mapping case at the stage the journal sets, and one marked as without a process.
  assert.ok(lines.some((line) => line.StageId === 'session-held'));
  assert.ok(lines.some((line) => String(line.Actions).includes('no-process-undo=')));
});
