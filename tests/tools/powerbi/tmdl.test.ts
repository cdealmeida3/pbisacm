import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExpressions, readTable, tmdlName } from '../../../tools/powerbi/tmdl.ts';

/* The small TMDL reader of tools/powerbi/tmdl.ts: expressions with their description and group, tables with columns, measures and the M of the partition. */

function withFile(text: string, run: (file: string) => void): void {
  const folder = mkdtempSync(join(tmpdir(), 'tmdl-'));
  try { const file = join(folder, 'x.tmdl'); writeFileSync(file, text); run(file); } finally { rmSync(folder, { recursive: true, force: true }); }
}

test('an expression gives its M without the properties below it, its description and its query group (also with CRLF)', () => {
  const text = [
    '/// The first query.', '/// Two lines.', 'expression First =', '\t\tlet', '\t\t    a = 1', '\t\tin', '\t\t    a', '\tlineageTag: x', '\tqueryGroup: Reading', '',
    "expression 'Second one' = \"Sample\" meta [IsParameterQuery = true]", '\tqueryGroup: Parameters', ''
  ].join('\r\n');
  withFile(text, (file) => {
    assert.deepEqual(readExpressions(file), [
      { name: 'First', m: 'let\n    a = 1\nin\n    a', description: 'The first query.\nTwo lines.', queryGroup: 'Reading' },
      { name: 'Second one', m: '"Sample" meta [IsParameterQuery = true]', description: '', queryGroup: 'Parameters' }
    ]);
  });
});

test('a table gives its columns, its measures (one line and several) and the M of its partition', () => {
  const text = [
    'table Runs', '', "\tmeasure 'Run count' = COUNTROWS ( Runs )", '\t\tformatString: 0', '', '\tmeasure Long =', '\t\t\tVAR a = 1', '\t\t\tRETURN a', '',
    '\tcolumn ReportDate', '\t\tdataType: dateTime', '\t\tsourceColumn: ReportDate', '', "\tcolumn 'File name'", '\t\tdataType: string', '\t\tsourceColumn: FileName', '',
    '\tpartition Runs = m', '\t\tmode: import', '\t\tsource = RunsRows', ''
  ].join('\n');
  withFile(text, (file) => {
    const table = readTable(file);
    assert.equal(table.name, 'Runs');
    assert.deepEqual(table.columns, [{ name: 'ReportDate', dataType: 'dateTime', sourceColumn: 'ReportDate' }, { name: 'File name', dataType: 'string', sourceColumn: 'FileName' }]);
    assert.deepEqual(table.measures, [{ name: 'Run count', dax: 'COUNTROWS ( Runs )' }, { name: 'Long', dax: 'VAR a = 1\nRETURN a' }]);
    assert.equal(table.partitionM, 'RunsRows');
  });
});

test('a TMDL name is quoted when it is not one word', () => {
  assert.equal(tmdlName('Runs'), 'Runs');
  assert.equal(tmdlName('Report age'), "'Report age'");
  assert.equal(tmdlName("Carlos's"), "'Carlos''s'");
});
