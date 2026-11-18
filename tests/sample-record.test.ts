import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { recordSamples } from './sample-record.ts';

/*
 * The invented samples must give exactly the recorded result: findings, cases, cards, owner groups, messages and exports.
 * A cleanup must not change one byte. When a change is meant to change a result, run `npm run record` and review the
 * difference of tests/recorded/ in the pull request.
 */

const folder = join(import.meta.dirname, 'recorded');
const filesIn = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? filesIn(join(dir, entry.name)) : [relative(folder, join(dir, entry.name)).replace(/\\/g, '/')]);

test('the invented samples give the recorded result, byte for byte', async () => {
  const now = await recordSamples();
  assert.ok(existsSync(folder), 'tests/recorded/ is missing: run npm run record');
  assert.deepEqual(filesIn(folder).sort(), Object.keys(now).sort(), 'The recorded files differ from what the samples give: run npm run record and review the difference.');
  for (const [file, text] of Object.entries(now)) {
    const recorded = readFileSync(join(folder, file), 'utf8');
    assert.ok(recorded === text, `${file} differs from the recorded result. If the change is meant, run npm run record and review the difference.`);
  }
});

test('recording twice gives the same bytes', async () => {
  assert.deepEqual(await recordSamples(), await recordSamples());
});
