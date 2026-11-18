// Writes the recorded result of the invented samples to tests/recorded/ (see tests/sample-record.ts).
// Run: npm run record. Only after a change that is meant to change a result; review the difference before committing.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { recordSamples } from '../tests/sample-record.ts';

const folder = join(import.meta.dirname, '..', 'tests', 'recorded');
const files = await recordSamples();
rmSync(folder, { recursive: true, force: true });
for (const [file, text] of Object.entries(files)) {
  mkdirSync(dirname(join(folder, file)), { recursive: true });
  writeFileSync(join(folder, file), text);
}
console.log(`tests/recorded/: ${Object.keys(files).length} files written.`);
