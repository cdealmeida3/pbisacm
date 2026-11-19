import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRealShape, realShapeFiles, solusiWorkbook } from './real-shape.ts';
import { zipEntries } from '../src/core/reading/xlsx.ts';

/*
 * The real-shape samples (D353): invented files with the shapes of Carlos's folder on one day. The whole result is in
 * tests/recorded/real-shape.json (sample-record.test.ts); these cases name what the samples are there for.
 */

test('real shape: the Solusi workbook names every element with a prefix, as the real export does', () => {
  const book = solusiWorkbook();
  assert.ok(zipEntries(book).some((entry) => entry.name === 'xl/worksheets/sheet1.xml'));
  assert.deepEqual(solusiWorkbook(), book, 'the same bytes every time');
});

test('real shape: each file has its type, the copy of the day and the known files are not used', async () => {
  const { files } = await readRealShape();
  const of = (part: string) => files.find((file) => file.name.includes(part))!;
  assert.deepEqual(files.map((file) => file.kind), ['ci', 'solusi', 'epo', 'contract', 'ci', 'links', 'health', 'relationship']);
  assert.equal(of('_1cmdb').used, false);
  assert.match(of('_1cmdb').whyNotUsed, /Move this copy into the sub-folder Archive/);
  assert.equal(of('_cmdb_logical').used, true);
  // The CMDB Health result has a name and a class (ci, ci.sys_class_name) but is never the CI report (D341).
  assert.equal(of('health').kind, 'health');
  assert.equal(of('contract_ci').kind, 'links');
  // The scoped-app columns are matched by the end of their name (D351).
  assert.equal(of('rel_ci').fact, 'excluded: 1');
  assert.equal(of('ast_contract').fact, 'criticality: 2');
  // The date past Excel's last day gives an empty cell, and the contracts are read (D350).
  assert.equal(of('.xlsx').rows, 5);
});

test('real shape: what to fix in the folder names the CI columns to add and the copy, then the known files', async () => {
  const { fixes } = await readRealShape();
  assert.deepEqual(fixes.map((fix) => fix.level), ['fix', 'fix', 'known', 'known']);
  assert.match(fixes[0]!.what, /^Lacks 14 columns the checks read/);
});

test('real shape: the samples are invented (the criticality prefix of the registry, no real report name)', () => {
  for (const file of realShapeFiles()) {
    if (!file.name.endsWith('.csv')) continue;
    const text = readFileSync(new URL(`../samples/real-shape/${file.name}`, import.meta.url), 'utf8');
    for (const header of (text.split(/\r?\n/)[0] ?? '').split(/[;,]/)) {
      if (/crit/.test(header)) assert.match(header, /x_demo_crit_/, `${file.name}: ${header}`);
    }
  }
});
