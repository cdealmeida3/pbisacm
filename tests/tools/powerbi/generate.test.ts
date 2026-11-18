import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPackFiles } from '../../../src/hosts/cli.ts';
import { lightColours, mText, queries, readingRules, staleQueries, theme, THEME_FILE } from '../../../tools/powerbi/generate.ts';
import { readExpressions, readTables } from '../../../tools/powerbi/tmdl.ts';
import { evaluatedNames } from '../../../tools/powerbi/connector.ts';
import { UNIT_PAGE_SIZE, unitCases, unitQuery, unitQueryNames } from '../../../tools/powerbi/units.ts';

/*
 * The Power BI project (powerbi/, plan §3 and §4): the generated parts are up to date, the model opens with the
 * invented samples, and every table reads from one query of expressions.tmdl. The real Power Query runs in the CI job
 * "powerbi-eval" (Windows); its syntax and the report files are checked by npm run powerbi:lint.
 */

test('expressions.tmdl and the theme are what tools/powerbi/generate.ts writes now (npm run powerbi:generate)', () => {
  assert.deepEqual(staleQueries(), []);
});

test('a text in M doubles its quotes and escapes #(', () => {
  assert.equal(mText('say "hi"'), '"say ""hi"""');
  assert.equal(mText('#(tab)'), '"#(#)(tab)"');
});

test('the model opens with the invented samples: SourceMode is Sample, the SharePoint site and the ServiceNow address are the invented ones', () => {
  const expressions = new Map(readExpressions().map((expression) => [expression.name, expression]));
  assert.match(expressions.get('SourceMode')!.m, /^"Sample" meta \[IsParameterQuery = true/);
  assert.match(expressions.get('SharePointSite')!.m, /^"https:\/\/contoso\.sharepoint\.com\/sites\/sacm" meta/);
  assert.match(expressions.get('ServiceNowAddress')!.m, /^"https:\/\/contoso\.service-now\.com" meta/);
  for (const name of ['SourceMode', 'SharePointSite', 'ReportsFolder', 'ServiceNowAddress']) assert.equal(expressions.get(name)!.queryGroup, 'Parameters', name);
});

test('every query of expressions.tmdl has a group, and every query the generator writes is in it once', () => {
  const expressions = readExpressions();
  const names = expressions.map((expression) => expression.name);
  assert.equal(new Set(names).size, names.length);
  for (const expression of expressions) assert.ok(expression.queryGroup, `${expression.name} has no queryGroup`);
  assert.deepEqual(queries().map((query) => query.name), names);
});

test('every table reads from its own query <Table>Rows, and the evaluation runs every table and the unit cases', () => {
  const names = new Set(readExpressions().map((expression) => expression.name));
  const tables = readTables();
  for (const table of tables) {
    assert.equal(table.partitionM, `${table.name}Rows`, table.name);
    assert.ok(names.has(table.partitionM), `${table.partitionM} is not in expressions.tmdl`);
    assert.ok(table.columns.length > 0, `${table.name} has no column`);
  }
  assert.deepEqual(evaluatedNames(), [...tables.map((table) => table.name), ...unitQueryNames()]);
});

test('each unit query has at most 1,000 rows (PQTest returns no more), and the pages hold every case once', () => {
  const pages = unitQueryNames();
  assert.equal(pages.length, Math.ceil(unitCases().length / UNIT_PAGE_SIZE));
  assert.ok(UNIT_PAGE_SIZE <= 1000);
  const rows = pages.map((_, at) => (unitQuery(at + 1).match(/^ {8}\{/gm) ?? []).length);
  assert.equal(rows.reduce((sum, count) => sum + count, 0), unitCases().length);
  for (const count of rows) assert.ok(count <= UNIT_PAGE_SIZE, String(count));
});

test('the reading rules carry every report type; a type\'s own stale age is never below the default of the app (as tiles.ts)', () => {
  const rules = readingRules() as { reportTypes: Array<{ kind: string; staleAfter?: number }>; staleDays: number };
  assert.deepEqual(rules.reportTypes.map((type) => type.kind), ['ci', 'relationship', 'epo', 'solusi', 'contract']);
  for (const type of rules.reportTypes) assert.ok((type.staleAfter ?? rules.staleDays) >= rules.staleDays, type.kind);
});

test('the theme uses the colours of LOOK.md (src/app/styles.css) and the committed theme is the generated one', () => {
  const look = new Set(Object.values(lightColours()));
  const written = JSON.stringify(theme());
  for (const colour of written.match(/#[0-9a-f]{6}/gi) ?? []) assert.ok(look.has(colour.toLowerCase()), colour);
  assert.deepEqual(JSON.parse(readFileSync(THEME_FILE, 'utf8')), theme());
});

test('the packed check files are every check file, and the unit cases cover each reading function', () => {
  const packed = JSON.parse(queries().find((query) => query.name === 'CheckFiles')!.m.replace(/^"|"$/g, '').replace(/""/g, '"').replace(/#\(#\)\(/g, '#(')) as Array<{ pack: { id: string } }>;
  assert.equal(packed.length, loadPackFiles().length);
  const functions = new Set(unitCases().map((item) => item.name.split(' ')[0]));
  for (const name of ['fnParseDate', 'fnLevel', 'fnNameKey', 'fnNormaliseHeader', 'fnCanonicalClass', 'fnFlag', 'fnReportType']) assert.ok(functions.has(name), name);
});
