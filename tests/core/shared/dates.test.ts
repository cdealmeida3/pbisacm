import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { datesInText, longDate, screenDate } from '../../../src/core/shared/dates.ts';

/* One date format (F49, D176): "12 Nov 2026" on the screen, "12 November 2026" in formal records. */

test('the screen date has its year; in a list a date of this year has none', () => {
  assert.equal(screenDate('2026-11-12'), '12 Nov 2026');
  assert.equal(screenDate('2026-11-02', '2026'), '2 Nov');
  assert.equal(screenDate('2025-11-12', '2026'), '12 Nov 2025');
  assert.equal(screenDate('2026-11-12T08:10:00Z'), '12 Nov 2026');
  assert.equal(screenDate(''), '');
  assert.equal(screenDate('soon'), 'soon');
  assert.equal(longDate('2026-11-12'), '12 November 2026');
});

test('a date inside a sentence is written as the screen shows it; a file name keeps its date', () => {
  assert.equal(datesInText('Used the Relationship report of 2026-11-08, 4 days from this CI report.'), 'Used the Relationship report of 8 Nov 2026, 4 days from this CI report.');
  assert.equal(datesInText('Loaded 2026-11-12_ci-report.csv (report of 2026-11-12)'), 'Loaded 2026-11-12_ci-report.csv (report of 12 Nov 2026)');
  assert.equal(datesInText('ci-2026-11-12.csv and 2026-11-12.xlsx'), 'ci-2026-11-12.csv and 2026-11-12.xlsx');
  assert.equal(datesInText('2026-11-12: loaded.'), '12 Nov 2026: loaded.');
});

test('no screen prints a date as yyyy-mm-dd: every date of src/app goes through a helper', () => {
  const root = join(import.meta.dirname, '../../../src/app');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file));
  assert.ok(files.length > 30);
  // A date field put straight into a text: `… of ${run.date}` or {run.date} between tags. A file name (`${date}_name.csv`),
  // a key or a value handed to a function is not a text. Journal lines (record) keep their dates as they are: the files are data.
  const inTemplate = /\$\{[\w.?!]*(?:[dD]ate|reviewOn|retireOn|verifiedOn|firstSeen|lastContact|today\(\))\}(?![_|T\w-])/;
  const inMarkup = />\s*\{[\w.?!]*(?:[dD]ate|reviewOn|retireOn|verifiedOn|firstSeen|lastContact)\}/;
  for (const file of files) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/\brecord(All)?\(|runFileName\(|key=|Id\(|Path\(|seeded\(/.test(line) && !inMarkup.test(line)) return;
      assert.ok(!inTemplate.test(line) && !inMarkup.test(line), `src/app/${file}:${index + 1} prints a date without screenDate, shortDate, yearDate or longDate: ${line.trim().slice(0, 140)}`);
    });
  }
});
