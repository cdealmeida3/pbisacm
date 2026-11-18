// The checks of the Power BI project that need the dev packages (npm ci) and .NET 8, run by the CI job "checks"
// (plan §9.1). `npm test` needs nothing installed, so these are a separate command:
//   npm run powerbi:lint
//   1. TMDL: Microsoft's library reads and validates the model (tools/powerbi/tmdl-check/, needs `dotnet`).
//   2. M: every query, every table partition and the test connector parse (Microsoft's @microsoft/powerquery-parser).
//   3. PBIR: every report file is valid against Microsoft's JSON schemas (a copy in tools/powerbi/schemas/).
//   4. References: every table, column and measure a visual or a measure names is in the model.
//   5. Generated parts up to date (also in npm test).
//   6. Checks: every built detector is a module of a check in use and has its query fnDetect<Module>; every other check
//      gets the note "not built" (fnNotesPart); card labels are unique.
//   8. Run (D284, D290): each calculated table has the fixed form, takes the rows of a part that RunRows (or fnHistoryRun,
//      for HistoryRun) makes, and lists its columns in the order of its TMDL file; Run and HistoryRun are hidden and have
//      no relationship; HistoryRun has its incremental refresh; every metric of the history self-check has its measure;
//      no query of powerbi/m is a probe.
//   7. Colours: every colour of the theme and the measures is a colour of LOOK.md, and each state colour reads on its
//      fill and on the page with a contrast of 4.5:1 or more.
// --no-dotnet skips step 1 and says so (for a computer without .NET); the CI never uses it.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as PQP from '@microsoft/powerquery-parser';
import Ajv from 'ajv';
import type { AnySchema } from 'ajv';
import { MODEL, readExpressions, readTables, SOURCE_TABLES } from './tmdl.ts';
import { EXPECTED_HISTORY, lightColours, staleQueries, THEME_FILE } from './generate.ts';
import { connectorSource } from './connector.ts';
import { loadPackFiles } from '../../src/hosts/cli.ts';

const root = join(import.meta.dirname, '..', '..');
const REPORT = join(root, 'powerbi', 'SACM-Workbench.Report');
const SCHEMAS = join(import.meta.dirname, 'schemas');
const problems: string[] = [];
const done: string[] = [];

const filesUnder = (folder: string, pattern: RegExp): string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' }).map((file) => join(folder, file)).filter((file) => pattern.test(file)).sort();

/* 1. TMDL */
if (process.argv.includes('--no-dotnet')) {
  done.push('TMDL: NOT CHECKED (--no-dotnet). The CI checks it.');
} else {
  const run = spawnSync('dotnet', ['run', '--project', join(import.meta.dirname, 'tmdl-check'), '-c', 'Release', '--', MODEL], { encoding: 'utf8' });
  if (run.error) problems.push(`TMDL: dotnet could not start (${run.error.message}). Install the .NET 8 SDK, or run with --no-dotnet.`);
  else if (run.status !== 0) problems.push(`TMDL: ${(run.stderr || run.stdout).trim()}`);
  else done.push((run.stdout.split('\n')[0] ?? '').trim());
}

/* 2. M */
// A name defined twice in one let, one record or the section parses, but Power Query refuses the whole section: in the test
// connector no query runs at all ("SacmEval.Contents wasn't recognized").
interface AstNode {
  kind?: string; variableList?: { elements: Array<{ node?: { key?: { literal?: string } } }> }; content?: AstNode['variableList'];
  sectionMembers?: { elements: Array<{ namePairedExpression?: { key?: { literal?: string } } }> }
}
const definedTwice = (ast: unknown): string[] => {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const item = node as AstNode;
    const list = item.kind === 'LetExpression' ? item.variableList?.elements.map((csv) => csv.node?.key?.literal)
      : item.kind === 'RecordExpression' ? item.content?.elements.map((csv) => csv.node?.key?.literal)
      : item.kind === 'Section' ? item.sectionMembers?.elements.map((member) => member.namePairedExpression?.key?.literal) : undefined;
    if (list) {
      const names = list.map((literal) => (literal ?? '').replace(/^#"(.*)"$/, '$1').replace(/""/g, '"')).filter(Boolean);
      for (const name of new Set(names)) if (names.indexOf(name) !== names.lastIndexOf(name)) out.push(name);
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'parent' && typeof value === 'object') walk(value);
  };
  walk(ast);
  return out;
};
const parse = async (what: string, text: string): Promise<void> => {
  const task = await PQP.TaskUtils.tryLexParse(PQP.DefaultSettings, text);
  if (!PQP.TaskUtils.isParseStageOk(task)) {
    const error = (task as { error?: { message?: string } }).error;
    problems.push(`M: ${what} does not parse: ${error?.message ?? task.stage}`);
    return;
  }
  for (const name of definedTwice((task as { ast?: unknown }).ast)) problems.push(`M: ${what} defines ${name} twice in one let, record or section`);
};
const expressions = readExpressions();
const tables = readTables();
for (const expression of expressions) await parse(`query ${expression.name}`, expression.m);
for (const table of tables) if (table.partitionKind !== 'calculated') await parse(`the partition of table ${table.name}`, table.partitionM);
await parse('the test connector (tools/powerbi/connector.ts)', connectorSource());
await parse('the test connector with the probes (--real-size --stages)', connectorSource({ realSize: true, copies: 1, stages: true }));
done.push(`M: ${expressions.length} queries, ${tables.length} partitions and the test connector parse`);

/* 3. PBIR */
const ajv = new Ajv({ strict: false, allErrors: true });
// Each schema is known by the address of its path: Microsoft's $id of the two "embedded" schemas differs from the name
// the others refer to (schema.embedded.json, schema-embedded.json).
const SCHEMA_BASE = 'https://developer.microsoft.com/json-schemas/fabric/';
for (const file of filesUnder(SCHEMAS, /\.json$/)) {
  const schema = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  ajv.addSchema({ ...schema, $id: SCHEMA_BASE + relative(SCHEMAS, file).replace(/\\/g, '/') } as AnySchema);
}
const pbirFiles = [join(root, 'powerbi', 'SACM-Workbench.pbip'), join(root, 'powerbi', 'SACM-Workbench.SemanticModel', 'definition.pbism'),
  join(REPORT, 'definition.pbir'), ...filesUnder(join(REPORT, 'definition'), /\.json$/)];
for (const file of pbirFiles) {
  const value = JSON.parse(readFileSync(file, 'utf8')) as { $schema?: string };
  const where = relative(root, file);
  const validate = value.$schema ? ajv.getSchema(value.$schema) : undefined;
  if (!validate) { problems.push(`PBIR: ${where}: its $schema ${value.$schema ?? '(none)'} is not in tools/powerbi/schemas/`); continue; }
  if (!validate(value)) for (const error of (validate.errors ?? []).slice(0, 5)) problems.push(`PBIR: ${where}: ${error.instancePath || '/'} ${error.message}`);
}
done.push(`PBIR: ${pbirFiles.length} files checked against the schemas`);

/* 4. References */
const columns = new Map(tables.map((table) => [table.name, new Set(table.columns.map((column) => column.name))]));
const measures = new Map(tables.map((table) => [table.name, new Set(table.measures.map((measure) => measure.name))]));
const allMeasures = new Set(tables.flatMap((table) => table.measures.map((measure) => measure.name)));
const visit = (value: unknown, where: string): void => {
  if (Array.isArray(value)) { value.forEach((item) => visit(item, where)); return; }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const kind of ['Column', 'Measure'] as const) {
    const ref = record[kind] as { Expression?: { SourceRef?: { Entity?: string } }; Property?: string } | undefined;
    const entity = ref?.Expression?.SourceRef?.Entity;
    if (!ref || !entity || !ref.Property) continue;
    const known = (kind === 'Column' ? columns : measures).get(entity);
    if (!known) problems.push(`References: ${where} names the table ${entity}, which is not in the model`);
    else if (!known.has(ref.Property)) problems.push(`References: ${where} names the ${kind.toLowerCase()} ${entity}[${ref.Property}], which is not in the model`);
  }
  for (const item of Object.values(record)) visit(item, where);
};
for (const file of filesUnder(join(REPORT, 'definition'), /visual\.json$/)) visit(JSON.parse(readFileSync(file, 'utf8')), relative(root, file));
for (const table of tables) {
  for (const measure of table.measures) {
    const dax = measure.dax.replace(/"(?:[^"]|"")*"/g, '""');
    for (const match of dax.matchAll(/(?:'([^']+)'|\b([A-Za-z_][A-Za-z0-9_]*))\s*\[([^\]]+)\]/g)) {
      const entity = match[1] ?? match[2]!;
      if (!columns.has(entity)) problems.push(`References: measure ${table.name}[${measure.name}] names the table ${entity}, which is not in the model`);
      else if (!columns.get(entity)!.has(match[3]!) && !measures.get(entity)!.has(match[3]!)) problems.push(`References: measure ${table.name}[${measure.name}] names ${entity}[${match[3]}], which is not in the model`);
    }
    for (const match of dax.matchAll(/(?<![\w'\]])\[([^\]]+)\]/g)) {
      if (!allMeasures.has(match[1]!)) problems.push(`References: measure ${table.name}[${measure.name}] names the measure [${match[1]}], which is not in the model`);
    }
  }
}
for (const table of tables) {
  if (table.partitionKind === 'calculated') {
    const from = table.calculated!.source;
    for (const [, source] of table.calculated!.columns) if (!columns.get(from)?.has(source)) problems.push(`References: table ${table.name} takes ${from}[${source}], which is not in the model`);
  } else if (!table.partitionM) problems.push(`References: table ${table.name} has no M partition`);
}
done.push('References: every field of the visuals and the measures is in the model');

/* 5. Generated */
for (const problem of staleQueries()) problems.push(`Generated: ${problem} (npm run powerbi:generate)`);
done.push('Generated: expressions.tmdl and the theme are up to date');

/* 6. Checks */
const packs = loadPackFiles().map((file) => file.pack as { id: string; status: string; cardLabel?: string; detector: { type: string; module?: string } }).filter((pack) => pack.status !== 'off');
const builtM = expressions.find((expression) => expression.name === 'BuiltDetectors')?.m ?? '';
const built = [...builtM.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
const modules = new Set(packs.map((pack) => (pack.detector.type === 'rule' ? 'rule' : pack.detector.module ?? pack.detector.type)));
const detectorFunction = (module: string): string => `fnDetect${module.split(/[/._-]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
const names = new Set(expressions.map((expression) => expression.name));
for (const name of built) {
  if (!modules.has(name)) problems.push(`Checks: BuiltDetectors names "${name}", which no check in use has`);
  if (!names.has(detectorFunction(name))) problems.push(`Checks: BuiltDetectors names "${name}", but the query ${detectorFunction(name)} is not in powerbi/m/`);
}
// Every other check in use gets the grey note "not built" from the query fnNotesPart, so no card is a silent pass.
if (!/not\s+\[Built\]/.test(expressions.find((expression) => expression.name === 'fnNotesPart')?.m ?? '')) problems.push('Checks: fnNotesPart no longer gives a note to every check that is not built');
const labels = new Map<string, string>();
for (const pack of packs) {
  if (!pack.cardLabel) { problems.push(`Checks: ${pack.id} has no cardLabel`); continue; }
  if (labels.has(pack.cardLabel)) problems.push(`Checks: ${pack.id} and ${labels.get(pack.cardLabel)} have the same card label "${pack.cardLabel}": the Cards page sorts by it`);
  labels.set(pack.cardLabel, pack.id);
}
done.push(`Checks: ${packs.length} in use, ${built.length} detectors built, card labels unique`);
// The days of "ends in the next … days" are data (endsWithinDays of contract-reports.json); the page has one measure for each.
const endsWithin = (JSON.parse(readFileSync(join(root, 'checks', 'reference', 'contract-reports.json'), 'utf8')) as { endsWithinDays: number[] }).endsWithinDays;
const endMeasures = (tables.find((table) => table.name === 'ContractChanges')?.measures ?? []).map((measure) => measure.name).filter((name) => /^Ends in \d+ days$/.test(name)).sort();
const wantEnds = endsWithin.map((days) => `Ends in ${days} days`).sort();
if (endMeasures.join(', ') !== wantEnds.join(', ')) problems.push(`Checks: ContractChanges has the measures [${endMeasures.join(', ')}], endsWithinDays of contract-reports.json asks for [${wantEnds.join(', ')}]`);
for (const measure of tables.find((table) => table.name === 'ContractChanges')?.measures ?? []) {
  const days = /^Ends in (\d+) days$/.exec(measure.name)?.[1];
  if (days && !new RegExp(`<=\\s*${days}\\b`).test(measure.dax)) problems.push(`Checks: the measure ContractChanges[${measure.name}] does not count up to ${days} days`);
}

/* 7. Colours */
const look = lightColours();
const lookValues = new Set(Object.values(look));
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string): number => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const coloursIn = (text: string): string[] => [...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase());
const themeText = readFileSync(THEME_FILE, 'utf8');
const used = [...coloursIn(themeText), ...tables.flatMap((table) => table.measures.flatMap((measure) => coloursIn(measure.dax))),
  ...filesUnder(join(REPORT, 'definition'), /\.json$/).flatMap((file) => coloursIn(readFileSync(file, 'utf8')))];
for (const colour of new Set(used)) if (!lookValues.has(colour)) problems.push(`Colours: ${colour} is not a colour of LOOK.md (src/app/styles.css)`);
for (const name of ['red', 'blue', 'teal', 'green', 'violet', 'amber', 'grey']) {
  for (const [background, label] of [[look[`${name}-soft`]!, `${name}-soft`], [look.surface!, 'surface'], [look.page!, 'page']] as const) {
    const ratio = contrast(look[name]!, background);
    if (ratio < 4.5) problems.push(`Colours: ${name} on ${label} has a contrast of ${ratio.toFixed(2)}, less than 4.5`);
  }
}
for (const name of ['ink', 'muted']) if (contrast(look[name]!, look.surface!) < 4.5) problems.push(`Colours: ${name} on surface has a contrast under 4.5`);
done.push('Colours: all of LOOK.md, every text 4.5:1 or more');

/* 8. Run */
const calculatedTables = tables.filter((table) => table.partitionKind === 'calculated');
const partsOf = (query: string): Set<string> => new Set([...(expressions.find((expression) => expression.name === query)?.m ?? '').matchAll(/\{"([A-Za-z]+)",\s*[A-Za-z]/g)].map((match) => match[1]!));
const madeBy: Record<string, string> = { Run: 'RunRows', HistoryRun: 'fnHistoryRun' };
for (const table of calculatedTables) {
  const { source, part, columns: taken } = table.calculated!;
  if (!partsOf(madeBy[source]!).has(part)) problems.push(`Run: table ${table.name} takes the part "${part}", which ${madeBy[source]} does not make`);
  const want = table.columns.map((column) => column.name).join(', ');
  if (taken.map(([name]) => name).join(', ') !== want) problems.push(`Run: table ${table.name} takes the columns [${taken.map(([name]) => name).join(', ')}], its TMDL file declares [${want}]`);
  for (const [name, column] of taken) if (column !== `${part}.${name}`) problems.push(`Run: table ${table.name} takes ${name} from ${source}[${column}], not ${source}[${part}.${name}]`);
}
const relationshipsText = readFileSync(join(MODEL, 'relationships.tmdl'), 'utf8');
for (const source of SOURCE_TABLES) {
  const hidden = tables.find((table) => table.name === source);
  if (!hidden) { problems.push(`Run: the table ${source} is not in the model`); continue; }
  const text = readFileSync(hidden.file, 'utf8');
  if (!/^\tisHidden$/m.test(text)) problems.push(`Run: the table ${source} is not hidden`);
  if (new RegExp(`\\b(?:fromColumn|toColumn):\\s*'?${source}'?\\.`).test(relationshipsText)) problems.push(`Run: the table ${source} has a relationship; the calculated tables have them`);
  if (source === 'HistoryRun' && !/^\trefreshPolicy$/m.test(text)) problems.push('Run: the table HistoryRun has no incremental refresh (refreshPolicy)');
}
// The Self-check page compares each metric of ExpectedHistory with the measure History found: each needs its branch.
const found = tables.find((table) => table.name === 'HistoryExpected')?.measures.find((measure) => measure.name === 'History found')?.dax ?? '';
for (const item of EXPECTED_HISTORY) if (!found.includes(`"${item.metric}"`)) problems.push(`Run: the measure HistoryExpected[History found] has no branch for the metric "${item.metric}" of ExpectedHistory`);
for (const expression of expressions) if (/^(?:Time|RealSize|Probe)/.test(expression.name)) problems.push(`Run: the query ${expression.name} has the name of a probe of tools/powerbi/probes.ts`);
done.push(`Run: ${calculatedTables.length} calculated tables take their part of Run or HistoryRun, both hidden`);

for (const line of done) console.log(line);
for (const problem of problems) console.error(problem);
console.log(problems.length ? `Power BI lint: ${problems.length} problems.` : 'Power BI lint: no problem.');
process.exit(problems.length ? 1 : 0);
