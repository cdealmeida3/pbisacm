// The Desktop check (build B8, D309): every visual of every page, run in the engine of Power BI Desktop on the invented
// samples, as Carlos sees it when he opens the report. The job "powerbi-desktop" (.github/workflows/powerbi.yml) installs
// Power BI Desktop on GitHub's Windows runner, opens the project, refreshes it and runs the query of each visual
// (tools/powerbi/desktop-check/, with Microsoft's client libraries). This file has the two ends, in TypeScript:
//   node tools/powerbi/desktop.ts queries <out.json> [drill.json] the DAX query of every visual (queriesOf), and one per
//                                                                value of a drill-through page (drill.json: the runner's)
//   node tools/powerbi/desktop.ts judge <results.json>           what Desktop would show wrong (judge); exit 1 on a problem
// 0.44.0 showed why the lint is not enough: visuals that said "Select or drag fields" (a measure Desktop dropped), a
// card that said "(Blank)", blank rows at the top of tables and lines that exist only because a measure gave text for
// nothing. Only invented data: the job runs in Sample mode.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const PAGES = join(root, 'powerbi', 'SACM-Workbench.Report', 'definition', 'pages');

interface FieldRef { Column?: Ref; Measure?: Ref }
interface Ref { Expression?: { SourceRef?: { Entity?: string; Source?: string } }; Property?: string }
interface Projection { field: FieldRef; queryRef: string; displayName?: string }
interface Literal { Literal?: { Value?: string } }
interface Condition {
  In?: { Expressions: FieldRef[]; Values: Literal[][] };
  Not?: { Expression: Condition };
  Comparison?: { ComparisonKind: number; Left: FieldRef; Right: Literal };
}
interface Filter { field?: FieldRef; filter?: { From?: Array<{ Name: string; Entity: string }>; Where?: Array<{ Condition: Condition }> }; howCreated?: string }

/** One query: a visual of a page, with the drill value it was run for, if any. */
export interface VisualQuery {
  page: string; pageName: string; visual: string; type: string; title: string;
  /** The column names of the result, in order: the group columns first, then the values. */
  groups: string[]; values: string[];
  /** For a drill-through page: the drill column and its value ("" for the page opened from its tab). */
  drill?: { column: string; value: string };
  dax: string;
}

/** A value of a visual's literal, in DAX: 'open' → "open", 1L → 1, true → TRUE (). */
export function daxLiteral(value: string): string {
  if (/^'.*'$/s.test(value)) return `"${value.slice(1, -1).replace(/''/g, "'").replace(/"/g, '""')}"`;
  if (/^-?\d+L$/.test(value)) return value.slice(0, -1);
  if (/^-?\d+(\.\d+)?D$/.test(value)) return value.slice(0, -1);
  if (value === 'true' || value === 'false') return `${value.toUpperCase()} ()`;
  const date = /^datetime'(\d{4}-\d{2}-\d{2})/.exec(value);
  if (date) return `DATEVALUE ( "${date[1]}" )`;
  throw new Error(`desktop.ts: a literal it does not read: ${value}`);
}

const quoteTable = (name: string): string => `'${name.replace(/'/g, "''")}'`;
const quoteName = (name: string): string => `[${name.replace(/]/g, ']]')}]`;

/** The DAX of a field: 'Table'[Column] or 'Table'[Measure]; `sources` names the tables of a filter's From. */
export function daxField(field: FieldRef, sources: Map<string, string> = new Map()): { dax: string; measure: boolean; table: string; name: string } {
  const ref = field.Column ?? field.Measure;
  if (!ref?.Property) throw new Error(`desktop.ts: a field it does not read: ${JSON.stringify(field)}`);
  const entity = ref.Expression?.SourceRef?.Entity ?? sources.get(ref.Expression?.SourceRef?.Source ?? '');
  if (!entity) throw new Error(`desktop.ts: a field without a table: ${JSON.stringify(field)}`);
  return { dax: `${quoteTable(entity)}${quoteName(ref.Property)}`, measure: !!field.Measure, table: entity, name: ref.Property };
}

/** The filters of a visual, as arguments of SUMMARIZECOLUMNS (columns) and as conditions on the result (measures). */
export function daxFilters(filters: Filter[]): { tables: string[]; measures: Array<{ dax: string; test: (column: string) => string }> } {
  const tables: string[] = [];
  const measures: Array<{ dax: string; test: (column: string) => string }> = [];
  for (const item of filters) {
    if (item.howCreated === 'Drillthrough' || !item.filter?.Where) continue;
    const sources = new Map((item.filter.From ?? []).map((entry) => [entry.Name, entry.Entity]));
    for (const { Condition: condition } of item.filter.Where) {
      const negated = !!condition.Not;
      const inner = condition.Not?.Expression ?? condition;
      if (inner.In) {
        const field = daxField(inner.In.Expressions[0]!, sources);
        const values = inner.In.Values.map((row) => daxLiteral(row[0]!.Literal!.Value!)).join(', ');
        tables.push(negated ? `FILTER ( ALL ( ${field.dax} ), NOT ${field.dax} IN { ${values} } )` : `TREATAS ( { ${values} }, ${field.dax} )`);
      } else if (inner.Comparison) {
        const field = daxField(inner.Comparison.Left, sources);
        const operator = ['=', '>', '>=', '<', '<='][inner.Comparison.ComparisonKind];
        if (!operator) throw new Error(`desktop.ts: a comparison it does not read: ${JSON.stringify(condition)}`);
        const right = daxLiteral(inner.Comparison.Right.Literal!.Value!);
        if (field.measure) measures.push({ dax: field.dax, test: (column) => `${negated ? 'NOT ' : ''}( [${column}] ${operator} ${right} )` });
        else tables.push(`FILTER ( ALL ( ${field.dax} ), ${negated ? 'NOT ' : ''}( ${field.dax} ${operator} ${right} ) )`);
      } else throw new Error(`desktop.ts: a filter it does not read: ${JSON.stringify(condition)}`);
    }
  }
  return { tables, measures };
}

/** The roles that group a visual (rows, columns, category) and the ones that hold its values, as Desktop queries them. */
const GROUP_ROLES = ['Rows', 'Columns', 'Category', 'Series', 'Legend'];

/**
 * The DAX query of one visual, as Desktop asks it: its columns grouped (SUMMARIZECOLUMNS drops a line whose values are
 * all blank, as a table visual does), its measures as values, its filters, and the drill value of the page if any.
 */
export function queryOf(projections: Array<{ role: string; projection: Projection }>, filters: Filter[], drill?: { dax: string; value: string }): { dax: string; groups: string[]; values: string[] } {
  const groups: string[] = [];
  const groupDax: string[] = [];
  const values: string[] = [];
  const valueDax: string[] = [];
  for (const { role, projection } of projections) {
    const field = daxField(projection.field);
    const label = projection.displayName ?? field.name;
    // A table visual groups every column it shows (the role Values holds both), a chart groups its category.
    if (field.measure) { values.push(label); valueDax.push(field.dax); }
    else if (role === 'Values' || GROUP_ROLES.includes(role)) {
      if (groupDax.includes(field.dax)) continue;
      groups.push(label); groupDax.push(field.dax);
    } else { values.push(label); valueDax.push(field.dax); }
  }
  const { tables, measures } = daxFilters(filters);
  if (drill) tables.push(drill.value === '' ? '' : `TREATAS ( { ${drill.value} }, ${drill.dax} )`);
  const filterArgs = tables.filter(Boolean);
  const named = valueDax.map((dax, at) => `"v${at}", ${dax}`);
  const tests = measures.map((item, at) => ({ name: `f${at}`, ...item }));
  const extra = tests.map((item) => `"${item.name}", ${item.dax}`);
  let table: string;
  if (groupDax.length === 0) {
    const row = `ROW ( ${[...named, ...extra].join(', ') || '"empty", BLANK ()'} )`;
    table = filterArgs.length ? `CALCULATETABLE ( ${row}, ${filterArgs.join(', ')} )` : row;
  } else table = `SUMMARIZECOLUMNS ( ${[...groupDax, ...filterArgs, ...named, ...extra].join(', ')} )`;
  if (tests.length) {
    // The columns of the measure filters come last; the judge reads only the groups and the values.
    table = `FILTER ( ${table}, ${tests.map((item) => item.test(item.name)).join(' && ')} )`;
  }
  return { dax: `EVALUATE ${table}`, groups, values };
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** Every query of the report: one per visual, and on a drill-through page one more per drill value (`drillValues`). */
export function queriesOf(drillValues: Map<string, string[]> = new Map()): VisualQuery[] {
  const queries: VisualQuery[] = [];
  const order = readJson<{ pageOrder: string[] }>(join(PAGES, 'pages.json')).pageOrder;
  for (const pageName of order) {
    const page = readJson<{ displayName: string; filterConfig?: { filters: Filter[] } }>(join(PAGES, pageName, 'page.json'));
    const drillFilter = page.filterConfig?.filters.find((item) => item.howCreated === 'Drillthrough');
    const drillField = drillFilter?.field ? daxField(drillFilter.field) : undefined;
    const folder = join(PAGES, pageName, 'visuals');
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).sort()) {
      const visual = readJson<{ visual?: { visualType: string; query?: { queryState?: Record<string, { projections?: Projection[] }> } }; filterConfig?: { filters: Filter[] } }>(join(folder, name, 'visual.json'));
      const state = visual.visual?.query?.queryState;
      if (!state) continue;
      const projections = Object.entries(state).flatMap(([role, value]) => (value.projections ?? []).map((projection) => ({ role, projection })));
      if (!projections.length) continue;
      const filters = [...(page.filterConfig?.filters ?? []), ...(visual.filterConfig?.filters ?? [])];
      const base = { page: page.displayName, pageName, visual: name, type: visual.visual!.visualType, title: name };
      const runs: Array<{ column: string; value: string } | undefined> = drillField
        ? [{ column: drillField.dax, value: '' }, ...(drillValues.get(drillField.dax) ?? []).map((value) => ({ column: drillField.dax, value }))]
        : [undefined];
      for (const drill of runs) {
        const query = queryOf(projections, filters, drill ? { dax: drill.column, value: drill.value === '' ? '' : `"${drill.value.replace(/"/g, '""')}"` } : undefined);
        queries.push({ ...base, ...query, ...(drill ? { drill } : {}) });
      }
    }
  }
  return queries;
}

/** The columns of the drill-through pages, so the runner can ask for their values first. */
export function drillColumns(): string[] {
  const order = readJson<{ pageOrder: string[] }>(join(PAGES, 'pages.json')).pageOrder;
  const columns = new Set<string>();
  for (const pageName of order) {
    const page = readJson<{ filterConfig?: { filters: Filter[] } }>(join(PAGES, pageName, 'page.json'));
    const drill = page.filterConfig?.filters.find((item) => item.howCreated === 'Drillthrough');
    if (drill?.field) columns.add(daxField(drill.field).dax);
  }
  return [...columns];
}

/* ------------------------------------------------------------------ the judge */

/** What the runner gives back for one query. */
export interface QueryResult { query: VisualQuery; error?: string; rows?: Array<Array<string | null>> }
/** What the runner gives back: the model's own errors (TOM), the open and refresh, and each query. */
export interface Results { opened: boolean; openError?: string; refreshError?: string; modelErrors: string[]; results: QueryResult[] }

const blank = (value: string | null | undefined): boolean => value === null || value === undefined || value === '';
const where = (query: VisualQuery): string => `${query.page} › ${query.visual}${query.drill ? (query.drill.value ? ` (drilled to ${query.drill.value})` : ' (opened from its tab)') : ''}`;

/**
 * What Desktop would show wrong, from the results of the runner:
 *   - the project does not open, or the refresh fails, or an object of the model has an error (TOM);
 *   - a query fails: the visual says "Something's wrong with one or more fields" or "Select or drag fields";
 *   - a card shows "(Blank)": its value is blank (a drill page opened from its tab included);
 *   - a table, matrix or chart has a line whose columns are all blank (the blank row of a relationship).
 * `notes`: what is worth a look but not wrong (an empty table).
 */
export function judge(results: Results): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!results.opened) { problems.push(`Desktop did not open the project: ${results.openError ?? 'no reason given'}`); return { problems, notes }; }
  if (results.refreshError) problems.push(`The refresh failed: ${results.refreshError}`);
  for (const error of results.modelErrors) problems.push(`Model: ${error}`);
  for (const { query, error, rows } of results.results) {
    if (error) { problems.push(`${where(query)}: the query fails, so Desktop shows the visual empty or broken: ${error.split('\n')[0]}`); continue; }
    const lines = rows ?? [];
    const groups = query.groups.length;
    if (query.type === 'card') {
      // A card of a column only (no measure) shows the column; one with measures shows the measures.
      if (!lines.length || lines[0]!.slice(query.values.length ? groups : 0).every(blank)) problems.push(`${where(query)}: the card shows "(Blank)" (${query.values.join(', ')})`);
      continue;
    }
    if (!lines.length) { if (!query.drill || query.drill.value) notes.push(`${where(query)}: empty`); continue; }
    if (query.type === 'slicer' || groups === 0) continue;
    const blankRows = lines.filter((line) => line.slice(0, groups).every(blank)).length;
    if (blankRows) problems.push(`${where(query)}: ${blankRows === 1 ? 'a line' : `${blankRows} lines`} with every column blank (${query.groups.join(', ')})`);
  }
  return { problems, notes };
}

/* ------------------------------------------------------------------ the command line */

if (import.meta.main) {
  const [command, file, extra] = process.argv.slice(2);
  if (command === 'queries' && file) {
    const drills = extra && existsSync(extra) ? new Map(Object.entries(readJson<Record<string, string[]>>(extra))) : new Map<string, string[]>();
    const queries = queriesOf(drills);
    writeFileSync(file, JSON.stringify({ drillColumns: drillColumns(), queries }, null, 1));
    console.log(`${queries.length} queries of ${new Set(queries.map((query) => `${query.pageName}/${query.visual}`)).size} visuals written to ${file}`);
  } else if (command === 'judge' && file) {
    const results = readJson<Results>(file);
    // What each visual shows, short, so the log can be read like the pages.
    for (const { query, error, rows } of results.results) {
      if (query.drill?.value) continue;
      const shown = error ? `ERROR ${error.split('\n')[0]}` : `${rows!.length} line${rows!.length === 1 ? '' : 's'}${rows!.length ? ': ' + rows!.slice(0, 3).map((row) => row.map((value) => value ?? '·').join(' | ')).join(' ¶ ') : ''}`;
      console.log(`${query.page} › ${query.visual} [${query.type}] ${shown.slice(0, 300)}`);
    }
    const { problems, notes } = judge(results);
    for (const note of notes) console.log(`Note: ${note}`);
    for (const problem of problems) console.log(`PROBLEM: ${problem}`);
    console.log(problems.length ? `Desktop check: ${problems.length} problem${problems.length === 1 ? '' : 's'}.` : 'Desktop check: no problem.');
    process.exit(problems.length ? 1 : 0);
  } else {
    console.error('Usage: node tools/powerbi/desktop.ts queries <out.json> [drill-values.json] | judge <results.json>');
    process.exit(2);
  }
}
