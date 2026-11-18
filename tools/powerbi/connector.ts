// Packs the Power Query of the model into a small test connector, so Microsoft's Power Query test tool (PQTest, Windows
// only) can run it on the invented samples (spike S2 of the plan, the CI job "powerbi-eval"):
//   node tools/powerbi/connector.ts [folder]      writes <folder>/SacmEval/SacmEval.pq and <folder>/queries/<Table>.pq
//   node tools/powerbi/connector.ts <folder> --real-size   the same with the samples at the size of the real reports (scaled.ts)
// Every shared query of expressions.tmdl and the M of every table partition become members of one section document; the
// connector's one function returns a table by its name. The queries run in Sample mode, as on Carlos's PC, with no data
// source: SharePoint is never opened. The default folder is .build/powerbi/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readExpressions, readTables } from './tmdl.ts';
import { unitQuery, unitQueryNames } from './units.ts';
import { scaledSampleFiles } from './scaled.ts';
import { mText } from './generate.ts';

const root = join(import.meta.dirname, '..', '..');
export const EVAL_FOLDER = join(root, '.build', 'powerbi');

/** A section member name: a plain identifier stays as it is, any other is written #"...". */
const member = (name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `#"${name.replace(/"/g, '""')}"`);

/** The names the evaluation runs: every table, and the unit cases of the reading functions. */
export function evaluatedNames(): string[] {
  return [...readTables().map((table) => table.name), ...unitQueryNames()];
}

export function connectorSource(realSize = false): string {
  const members: string[] = [];
  const scaled = (): string => `#table(type table [FileName = text, Base64 = text], {\n${scaledSampleFiles().map((file) => `\t{${mText(file.name)}, ${mText(file.base64)}}`).join(',\n')}\n})`;
  for (const expression of readExpressions()) members.push(`${member(expression.name)} =\n${realSize && expression.name === 'SampleFiles' ? scaled() : expression.m};`);
  const tables = readTables();
  for (const table of tables) members.push(`${member(table.name)} =\n${table.partitionM};`);
  unitQueryNames().forEach((name, at) => members.push(`${name} =\n${unitQuery(at + 1)};`));
  const results = evaluatedNames().map((name) => `${member(name)} = ${member(name)}`).join(', ');
  return [
    'section SacmEval;',
    '',
    '[DataSource.Kind = "SacmEval"]',
    'shared SacmEval.Contents = (name as text) as any => Record.Field(Results, name);',
    '',
    'SacmEval = [Authentication = [Anonymous = []], Label = "SACM Workbench evaluation"];',
    '',
    `Results = [${results}];`,
    '',
    members.join('\n\n'),
    ''
  ].join('\n');
}

if (process.argv[1] === import.meta.filename) {
  const folder = process.argv[2] ?? EVAL_FOLDER;
  const realSize = process.argv.includes('--real-size');
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(join(folder, 'SacmEval'), { recursive: true });
  mkdirSync(join(folder, 'queries'), { recursive: true });
  writeFileSync(join(folder, 'SacmEval', 'SacmEval.pq'), connectorSource(realSize));
  for (const name of evaluatedNames()) writeFileSync(join(folder, 'queries', `${name}.pq`), `SacmEval.Contents("${name}")\n`);
  console.log(`Power BI: wrote the test connector${realSize ? ' (samples at real size)' : ''} and ${evaluatedNames().length} queries to ${folder}.`);
}
