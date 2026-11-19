// Packs the Power Query of the model into a small test connector, so Microsoft's Power Query test tool (PQTest, Windows
// only) can run it on the invented samples (spike S2 of the plan, the CI job "powerbi-eval"):
//   node tools/powerbi/connector.ts [folder]      writes <folder>/SacmEval/SacmEval.pq and <folder>/queries/<Table>.pq
//   node tools/powerbi/connector.ts <folder> --live <k>   the same with only the first k members (members.txt) kept
//   node tools/powerbi/connector.ts <folder> --real-size [--copies <n>] [--history <k>] [--stages]
//       the same with the samples at the size of the real reports (scaled.ts), and the probes of the refresh time
//       (probes.ts) as the queries: Time.<Table>, with --stages the stages of the checks too, and RealSize.Summary.
// Every shared query of expressions.tmdl and the M of every table partition become members of one section document; the
// connector's one function returns a table by its name. The queries run in Sample mode, as on Carlos's PC, with no data
// source: SharePoint is never opened. The default folder is .build/powerbi/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readExpressions, readTables } from './tmdl.ts';
import { unitQuery, unitQueryNames } from './units.ts';
import { numberArgument, REAL_SIZE_COPIES, scaledSampleFiles } from './scaled.ts';
import { mText } from './generate.ts';
import { loadedTables, probeMembers } from './probes.ts';

const root = join(import.meta.dirname, '..', '..');
export const EVAL_FOLDER = join(root, '.build', 'powerbi');

/** A section member name: a plain identifier stays as it is, any other is written #"...". */
const member = (name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `#"${name.replace(/"/g, '""')}"`);

/** The queries that only the answer key reads (build B7): the drafts and chats of the samples with no journal. */
export const PARITY_QUERIES = ['DraftsRecorded', 'ChatsRecorded', 'EmailsSplit'];

/** The names the evaluation runs: every table, the unit cases of the reading functions and the queries of the answer key. */
export function evaluatedNames(): string[] {
  return [...readTables().map((table) => table.name), ...unitQueryNames(), ...PARITY_QUERIES];
}

/** The M a calculated table of the fixed form (D284) gives, from the member Run (or HistoryRun): its part's rows, its columns renamed. */
export function calculatedM(table: { name: string; source?: string; part: string; columns: Array<[string, string]> }): string {
  const pairs = table.columns.map(([name, source]) => `{${mText(source)}, ${mText(name)}}`).join(', ');
  return `let\n    rows = Table.SelectRows(${table.source ?? 'Run'}, each [Part] = ${mText(table.part)}),\n    picked = Table.SelectColumns(rows, {${table.columns.map(([, source]) => mText(source)).join(', ')}})\nin\n    Table.RenameColumns(picked, {${pairs}})`;
}

export interface ConnectorOptions {
  realSize?: boolean; copies?: number; history?: number; stages?: boolean;
  /** For tools/powerbi/load-check.ps1: only the first `live` members of loadOrder() keep their M; the others are null. */
  live?: number;
  /** For load-check.ps1: the M of these members instead of their own. */
  replace?: Record<string, string>;
}

/** The members of the connector, in order: every query, every table, the unit cases and (real size) the probes. */
export function connectorMembers(options: ConnectorOptions = {}): Array<{ name: string; m: string }> {
  const { realSize = false, copies = REAL_SIZE_COPIES, history = 0, stages = false } = options;
  const members: Array<{ name: string; m: string }> = [];
  const scaled = (): string => `#table(type table [FileName = text, Base64 = text], {\n${scaledSampleFiles(copies, history).map((file) => `\t{${mText(file.name)}, ${mText(file.base64)}}`).join(',\n')}\n})`;
  for (const expression of readExpressions()) members.push({ name: expression.name, m: realSize && expression.name === 'SampleFiles' ? scaled() : expression.m });
  for (const table of readTables()) {
    members.push({ name: table.name, m: table.partitionKind === 'calculated' ? calculatedM({ name: table.name, source: table.calculated!.source, part: table.calculated!.part, columns: table.calculated!.columns }) : table.partitionM });
  }
  unitQueryNames().forEach((name, at) => members.push({ name, m: unitQuery(at + 1) }));
  if (realSize) for (const probe of probeMembers(stages)) members.push(probe);
  return members;
}

/**
 * The members in an order where each comes after every member it names (load-check.ps1): then the first k members never
 * name a member left without its M, so a member that stops the connector is found by itself.
 */
export function loadOrder(options: ConnectorOptions = {}): string[] {
  const members = connectorMembers(options);
  const names = new Set(members.map((item) => item.name));
  const byName = new Map(members.map((item) => [item.name, item.m.replace(/"(?:[^"]|"")*"/g, '""')]));
  const out: string[] = [];
  const state = new Map<string, 'open' | 'done'>();
  const visit = (name: string): void => {
    if (state.has(name)) return;
    state.set(name, 'open');
    for (const match of byName.get(name)!.matchAll(/#"((?:[^"]|"")*)"|[A-Za-z_][A-Za-z0-9_.]*/g)) {
      const used = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[0];
      if (names.has(used) && used !== name) visit(used);
    }
    state.set(name, 'done');
    out.push(name);
  };
  for (const item of members) visit(item.name);
  return out;
}

export function connectorSource(options: ConnectorOptions | boolean = {}): string {
  const settings = typeof options === 'boolean' ? { realSize: options } : options;
  const { realSize = false, stages = false, live = Number.POSITIVE_INFINITY } = settings;
  // A member without its M (load-check.ps1) keeps its name, so every other member still compiles.
  const kept = Number.isFinite(live) ? new Set(loadOrder(settings).slice(0, live)) : null;
  const replace = settings.replace ?? {};
  const members = connectorMembers(settings).map((item) => `${member(item.name)} =\n${!kept || kept.has(item.name) ? replace[item.name] ?? item.m : 'null'};`);
  const extra = realSize ? probeMembers(stages) : [];
  const names = realSize ? extra.filter((probe) => probe.name.startsWith('Time.') || probe.name.startsWith('RealSize.')).map((probe) => probe.name) : evaluatedNames();
  const results = names.map((name) => `${member(name)} = ${member(name)}`).join(', ');
  return [
    'section SacmEval;',
    '',
    '[DataSource.Kind = "SacmEval"]',
    // The name is optional, so it is not part of the data source path: one credential for every query (tools/powerbi/time.ps1).
    'shared SacmEval.Contents = (optional name as text) as any => Record.Field(Results, name);',
    '',
    'SacmEval = [Authentication = [Anonymous = []], Label = "SACM Workbench evaluation"];',
    '',
    `Results = [${results}];`,
    '',
    members.join('\n\n'),
    ''
  ].join('\n');
}

/**
 * A query whose M is a let, with only its first `keep` steps: the values of the others are null (load-check.ps1 finds the
 * step that stops the connector). Returns the M and the names of the steps.
 */
export async function cutLet(m: string, keep: number): Promise<{ m: string; steps: string[] }> {
  const PQP = await import('@microsoft/powerquery-parser');
  const task = await PQP.TaskUtils.tryLexParse(PQP.DefaultSettings, m) as unknown as {
    ast?: { kind: string; variableList: { elements: Array<{ node: { key: { literal: string }; value: { tokenRange: { positionStart: { codeUnit: number }; positionEnd: { codeUnit: number } } } } }> } }
  };
  if (task.ast?.kind !== 'LetExpression') return { m, steps: [] };
  const steps = task.ast.variableList.elements.map((csv) => csv.node);
  let out = m;
  for (const step of steps.slice(keep).reverse()) {
    const range = step.value.tokenRange;
    out = out.slice(0, range.positionStart.codeUnit) + 'null' + out.slice(range.positionEnd.codeUnit);
  }
  return { m: out, steps: steps.map((step) => step.key.literal) };
}

/** The names of the queries the connector answers: the tables and unit cases, or with --real-size the probes. */
export function queryNames(options: ConnectorOptions): string[] {
  return options.realSize ? probeMembers(options.stages ?? false).map((probe) => probe.name).filter((name) => name.startsWith('Time.') || name.startsWith('RealSize.')) : evaluatedNames();
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const folder = args[0] && !args[0].startsWith('--') ? args[0] : EVAL_FOLDER;
  const options: ConnectorOptions = {
    realSize: args.includes('--real-size'), copies: numberArgument(args, '--copies', REAL_SIZE_COPIES), history: numberArgument(args, '--history', 0), stages: args.includes('--stages'),
    live: numberArgument(args, '--live', Number.POSITIVE_INFINITY)
  };
  // --cut <member> <k>: that member with only its first k steps (cutLet).
  if (args.includes('--cut')) {
    const name = args[args.indexOf('--cut') + 1] ?? '';
    const found = connectorMembers(options).find((item) => item.name === name);
    if (!found) throw new Error(`--cut: no member ${name}`);
    const cut = await cutLet(found.m, Number(args[args.indexOf('--cut') + 2] ?? 0));
    options.replace = { [name]: cut.m };
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'steps.txt'), cut.steps.join('\n') + '\n');
  }
  rmSync(join(folder, 'SacmEval'), { recursive: true, force: true });
  rmSync(join(folder, 'queries'), { recursive: true, force: true });
  mkdirSync(join(folder, 'SacmEval'), { recursive: true });
  mkdirSync(join(folder, 'queries'), { recursive: true });
  writeFileSync(join(folder, 'SacmEval', 'SacmEval.pq'), connectorSource(options));
  const names = queryNames(options);
  for (const name of names) writeFileSync(join(folder, 'queries', `${name}.pq`), `SacmEval.Contents(${mText(name)})\n`);
  // For tools/powerbi/load-check.ps1: the members in order.
  writeFileSync(join(folder, 'members.txt'), loadOrder(options).join('\n') + '\n');
  // For tools/powerbi/time.ps1: which probe is a table of the model (the sum T1), a stage, or the summary.
  if (options.realSize) {
    const tables = new Set(loadedTables().map((table) => `Time.${table}`));
    writeFileSync(join(folder, 'probes.json'), JSON.stringify(names.map((name) => ({ name, kind: tables.has(name) ? 'table' : name.startsWith('RealSize.') ? 'summary' : name === 'Time.Empty' ? 'empty' : 'stage' })), null, 2) + '\n');
  }
  console.log(`Power BI: wrote the test connector${options.realSize ? ` (samples at real size: ${options.copies} copies${options.history ? `, ${options.history} earlier dates` : ''})` : ''} and ${names.length} queries to ${folder}.`);
}
