// The Desktop check (build B8, D309): every visual of every page, run in the engine of Power BI Desktop on the invented
// samples, as Carlos sees it when he opens the report. The job "powerbi-desktop" (.github/workflows/powerbi.yml) installs
// Power BI Desktop on GitHub's Windows runner, opens the project, refreshes it and runs the query of each visual
// (tools/powerbi/desktop-check/, with Microsoft's client libraries). This file has the two ends, in TypeScript:
//   node tools/powerbi/desktop.ts queries <out.json> [drill.json] the DAX query of every visual (queriesOf), and one per
//                                                                value of a drill-through page (drill.json: the runner's)
//   node tools/powerbi/desktop.ts pages <out.json>               the pages in their order, for the pictures (pictures.ps1)
//   node tools/powerbi/desktop.ts judge <results.json> [pictures.json]
//                                                                what Desktop would show wrong (judge); exit 1 on a problem
//   node tools/powerbi/desktop.ts realsize <expressions.tmdl> packed|folder [--folder <path>] [--copies <n>] [--history <k>]
//                                                                the copy Desktop opens with the samples at real size (R4)
// 0.44.0 showed why the lint is not enough: visuals that said "Select or drag fields" (a measure Desktop dropped), a
// card that said "(Blank)", blank rows at the top of tables and lines that exist only because a measure gave text for
// nothing. Only invented data: the job runs in Sample mode.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPages, readTabGroups, textsOf } from './pages.ts';
import { historyStart, REAL_SIZE_COPIES, scaledSampleFiles } from './scaled.ts';
import { mText } from './generate.ts';
import { CELL_PADDING, TEXT, textWidth } from './tokens.ts';

const root = join(import.meta.dirname, '..', '..');
const PAGES = join(root, 'powerbi', 'SACM-Workbench.Report', 'definition', 'pages');
const MODEL_FOLDER = join(root, 'powerbi', 'SACM-Workbench.SemanticModel', 'definition');
/** The ids of the notes about a run as a whole, which no card has (fnNotesPart.pq). */
const RUN_NOTES = ['RELATIONSHIPS', 'PARKED', 'SOURCE-FIRST', 'Routing', 'Listing'];

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
  /** For a table: the width of each column in px, by the name of its result column (build R5, the broken words). */
  widths?: Record<string, number>;
  dax: string;
}

/** A value of a visual's literal, in DAX: 'open' → "open", 1L → 1, true → TRUE (). */
export function daxLiteral(value: string): string {
  if (/^'.*'$/s.test(value)) return `"${value.slice(1, -1).replace(/''/g, "'").replace(/"/g, '""')}"`;
  if (/^-?\d+L$/.test(value)) return value.slice(0, -1);
  if (/^-?\d+(\.\d+)?D$/.test(value)) return value.slice(0, -1);
  if (value === 'true' || value === 'false') return `${value.toUpperCase()} ()`;
  if (value === 'null') return 'BLANK ()';
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

/** The parts of a visual.json the check reads. */
interface VisualFile {
  visual?: { visualType: string; query?: { queryState?: Record<string, { projections?: Projection[] }> }; objects?: Record<string, ObjectEntry[]>; visualContainerObjects?: Record<string, ObjectEntry[]> };
  filterConfig?: { filters: Filter[] };
}
interface ObjectEntry { properties?: Record<string, { expr?: FieldRef }>; selector?: unknown }

/** The texts of a visual that a measure writes: its title, its subtitle, the text of a button. */
export function boundTexts(visual: VisualFile): Array<[string, FieldRef]> {
  const out: Array<[string, FieldRef]> = [];
  const places: Array<[string, ObjectEntry[] | undefined]> = [
    ['title', visual.visual?.visualContainerObjects?.title], ['subtitle', visual.visual?.visualContainerObjects?.subTitle], ['text', visual.visual?.objects?.text]
  ];
  for (const [where, entries] of places) {
    for (const entry of entries ?? []) {
      const expr = entry.properties?.text?.expr;
      if (expr?.Measure) out.push([where, { Measure: expr.Measure }]);
    }
  }
  return out;
}

/** The width of each column of a table visual, by the name its query gives the column (the header, else the field). */
export function columnWidths(visual: VisualFile, projections: Projection[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of visual.visual?.objects?.columnWidth ?? []) {
    const ref = (entry.selector as { metadata?: string } | undefined)?.metadata;
    const value = (entry.properties as Record<string, { expr?: Literal }> | undefined)?.value?.expr?.Literal?.Value;
    const projection = projections.find((item) => item.queryRef === ref);
    if (!projection || !value) continue;
    out[projection.displayName ?? daxField(projection.field).name] = Number(value.replace(/D$/, ''));
  }
  return out;
}

/**
 * The words of a table that do not fit their column (build R5, LOOK rule 3, D370: no word broken over two lines): Power BI
 * wraps a text at its spaces, and breaks a word longer than the column ("Descriptio n", "NAME-DUPLICA TE"). The width of
 * a word is the estimate of the lint (tokens.ts); a picture, a link, a date and a number are left out.
 */
export function brokenWords(query: VisualQuery, rows: Array<Array<string | null>>): string[] {
  const problems: string[] = [];
  const names = [...query.groups, ...query.values];
  names.forEach((name, at) => {
    const width = query.widths?.[name];
    if (!width) return;
    let longest = '';
    for (const row of rows) {
      const value = row[at];
      if (typeof value !== 'string' || /^(data:|https?:)/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value) || /^-?[\d.,]+$/.test(value)) continue;
      for (const word of value.split(/\s+/)) if (word.length > longest.length) longest = word;
    }
    const need = textWidth(longest, TEXT.table) + CELL_PADDING;
    if (longest && need > width) problems.push(`${where(query)}: the column "${name}" is ${width} px and "${longest}" needs ${need}: Power BI breaks the word over two lines (LOOK rule 3)`);
  });
  return problems;
}

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
      const visual = readJson<VisualFile>(join(folder, name, 'visual.json'));
      const filters = [...(page.filterConfig?.filters ?? []), ...(visual.filterConfig?.filters ?? [])];
      const base = { page: page.displayName, pageName, visual: name, type: visual.visual?.visualType ?? '', title: name };
      const runs: Array<{ column: string; value: string } | undefined> = drillField
        ? [{ column: drillField.dax, value: '' }, ...(drillValues.get(drillField.dax) ?? []).map((value) => ({ column: drillField.dax, value }))]
        : [undefined];
      const drillOf = (drill: { column: string; value: string } | undefined) => (drill ? { dax: drill.column, value: drill.value === '' ? '' : `"${drill.value.replace(/"/g, '""')}"` } : undefined);
      // The texts a measure writes: the title and the line under it (the empty state, D318), the text of a button.
      // A filter of a visual on a measure filters its lines, not these texts, so it is left out.
      const columnFilters = filters.filter((item) => !item.field?.Measure);
      for (const [where, field] of boundTexts(visual)) {
        for (const drill of runs) {
          const query = queryOf([{ role: 'Values', projection: { field, queryRef: where, displayName: field.Measure?.Property ?? where } }], columnFilters, drillOf(drill));
          queries.push({ ...base, type: 'text', title: `${name} ${where}`, ...query, ...(drill ? { drill } : {}) });
        }
      }
      const state = visual.visual?.query?.queryState;
      if (!state) continue;
      const projections = Object.entries(state).flatMap(([role, value]) => (value.projections ?? []).map((projection) => ({ role, projection })));
      if (!projections.length) continue;
      const widths = base.type === 'tableEx' ? columnWidths(visual, projections.map(({ projection }) => projection)) : undefined;
      for (const drill of runs) {
        const query = queryOf(projections, filters, drillOf(drill));
        queries.push({ ...base, ...query, ...(drill ? { drill } : {}), ...(widths ? { widths } : {}) });
      }
    }
  }
  return queries;
}

/**
 * One query per relationship of the model (D349): how many values of its many side have no row on its one side. Such a
 * value gives the one side a blank row, which a visual of that table shows as "(Blank)" and a count of the whole table
 * counts. ALLNOBLANKROW leaves out the blank row of each side itself, so only the values the table really holds count.
 * The judge wants 0.
 */
/**
 * The values a many side holds on purpose with no row on its one side, by relationship: a finding of a contract has the
 * key "contract:<number>", not a CI (D349); a note about the run as a whole (fnCheckRun, fnSourceFirst) has no card.
 * The query leaves them out; the measures that count those tables count DISTINCT keys, so their blank row counts nowhere.
 */
const runNote = (column: string): string => `NOT ${column} IN { ${RUN_NOTES.map((id) => `"${id}"`).join(', ')} }`;
export const EXPECTED_WITHOUT_ROW: Record<string, { why: string; keep: (column: string) => string }> = {
  Findings_Inventory: { why: 'the findings of contracts', keep: (column) => `NOT LEFT ( ${column}, 9 ) = "contract:"` },
  Notes_Checks: { why: 'the notes about the run as a whole', keep: runNote },
  HistoryNotes_Checks: { why: 'the notes about the run as a whole', keep: runNote }
};

export function blankRowQueries(): VisualQuery[] {
  const text = readFileSync(join(MODEL_FOLDER, 'relationships.tmdl'), 'utf8').replace(/\r\n/g, '\n');
  const quote = (table: string, column: string): string => `'${table.replace(/'/g, "''")}'[${column}]`;
  const queries: VisualQuery[] = [];
  for (const block of text.split(/\n(?=relationship )/)) {
    const name = /^relationship (\S+)/m.exec(block)?.[1];
    const from = /^\s*fromColumn: ([^.\n]+)\.(.+)$/m.exec(block);
    const to = /^\s*toColumn: ([^.\n]+)\.(.+)$/m.exec(block);
    if (!name || !from || !to) continue;
    const many = quote(from[1]!.trim(), from[2]!.trim());
    const one = quote(to[1]!.trim(), to[2]!.trim());
    const missing = `EXCEPT ( ALLNOBLANKROW ( ${many} ), ALLNOBLANKROW ( ${one} ) )`;
    const expected = EXPECTED_WITHOUT_ROW[name];
    queries.push({ page: 'Model', pageName: 'model', visual: name, type: 'blankrow', title: `${many} → ${one}`, groups: [], values: ['Without a row'],
      dax: `EVALUATE ROW ( "v0", COUNTROWS ( ${expected ? `FILTER ( ${missing}, ${expected.keep(many)} )` : missing} ) + 0 )` });
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

/** One page for the picture step (pictures.ps1, D318): its folder name, its tab, whether the team sees its tab. */
export interface PageEntry { name: string; displayName: string; hidden: boolean; drillThrough: boolean; width: number; height: number; tabs: string[]; words: string[] }

/** The tabs of each page (D323) after its first one, by their words: the picture step presses each and takes a picture. */
function tabsByPage(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of readTabGroups()) out.set(group.page, [...(out.get(group.page) ?? []), ...group.tabs.slice(1).map((tab) => tab.label)]);
  return out;
}

/**
 * The words a page writes itself (D328): the titles, the lines a file writes, the buttons, the text boxes, the headers
 * and the tabs. The look step measures these texts on the picture: Desktop also lists the texts of its own panes
 * (hidden behind the canvas) and the data of the samples, and only the report's own words are sure to be drawn.
 */
function wordsOf(visuals: Parameters<typeof textsOf>[0][], tabs: string[]): string[] {
  const words = new Set<string>(tabs);
  for (const visual of visuals) {
    // A chart names its legend and its bars with the names of its series: their boxes hold the colour of the series,
    // not the text alone, so a chart gives only its title (its colours are checked by the lint).
    const chart = /chart/i.test(visual.visual?.visualType ?? '');
    const own = chart && visual.visual ? { ...visual, visual: { ...visual.visual, query: undefined } } : visual;
    for (const { text } of textsOf(own)) if (text.trim()) words.add(text.trim());
  }
  return [...words].sort();
}

/** Every page in the order of pages.json: the picture step opens each from its tab (a drill-through page shows its empty state). */
export function pageList(): PageEntry[] {
  const order = readJson<{ pageOrder: string[] }>(join(PAGES, 'pages.json')).pageOrder;
  const tabs = tabsByPage();
  const report = readPages();
  return order.map((name) => {
    const page = readJson<{ displayName: string; visibility?: string; width: number; height: number; pageBinding?: { type?: string } }>(join(PAGES, name, 'page.json'));
    return { name, displayName: page.displayName, hidden: page.visibility === 'HiddenInViewMode', drillThrough: page.pageBinding?.type === 'Drillthrough', width: page.width, height: page.height, tabs: tabs.get(name) ?? [], words: wordsOf(report.pages.find((entry) => entry.page.name === name)?.visuals ?? [], tabs.get(name) ?? []) };
  });
}

/* ------------------------------------------------------------------ the judge */

/** What the runner gives back for one query. */
export interface QueryResult { query: VisualQuery; error?: string; rows?: Array<Array<string | null>> }
/** What the runner gives back: the model's own errors (TOM), the open and refresh, and each query. */
export interface Results { opened: boolean; openError?: string; refreshError?: string; modelErrors: string[]; results: QueryResult[] }
/** What the picture step gives back (pictures.ps1): per page the seconds it took to draw and the words of a broken visual it shows. */
export interface Pictures { taken: boolean; why?: string; pages: Array<{ page: string; displayName: string; found: boolean; seconds: number | null; file: string | null; broken: string[] | null; status?: string | null; look?: Look | null; tabs?: Array<{ tab: string; found: boolean; seconds?: number | null; file: string | null; broken?: string[]; look?: Look | null }> }> }
/**
 * What the picture step reads on the page as drawn (build D6, D328): where the page is on the screen (x, y, width,
 * height in pixels; empty when the navy rail was not seen), and every text of the page with its box in points of the
 * page, the background and the text colour measured on the picture, and their contrast.
 */
export interface Look { canvas: number[]; texts: LookText[] }
export interface LookText { text: string; x: number; y: number; width: number; height: number; background: string | null; colour: string | null; ratio: number | null }

/** The contrast every text needs (LOOK rule 8: 4.5:1 or more for every text, large text too). */
export const CONTRAST = 4.5;

/** The longest a page may take to draw in Desktop (D318): longer, and the team waits on app.powerbi.com too. */
export const DRAW_SECONDS = 3;

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
export function judge(results: Results, pictures?: Pictures): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  if (pictures) problems.push(...judgePictures(pictures, notes), ...judgeLook(pictures, notes));
  if (!results.opened) { problems.push(`Desktop did not open the project: ${results.openError ?? 'no reason given'}`); return { problems, notes }; }
  if (results.refreshError) problems.push(`The refresh failed: ${results.refreshError}`);
  for (const error of results.modelErrors) problems.push(`Model: ${error}`);
  for (const { query, error, rows } of results.results) {
    if (error) { problems.push(`${where(query)}: the query fails, so Desktop shows the visual empty or broken: ${error.split('\n')[0]}`); continue; }
    const lines = rows ?? [];
    const groups = query.groups.length;
    if (query.type === 'blankrow') {
      // A value of the many side with no row on the one side gives the one side a blank row (D349).
      const count = Number(lines[0]?.[0] ?? 0);
      if (count > 0) problems.push(`Relationship ${query.visual} (${query.title}): ${count === 1 ? 'one value' : `${count} values`} of the many side ${count === 1 ? 'has' : 'have'} no row on the one side, so that table gets a blank row`);
      continue;
    }
    if (query.type === 'text') {
      // A title, the line under it or the text of a button that a measure writes: blank leaves a box without its words.
      if (!lines.length || lines[0]!.every(blank)) problems.push(`${where(query)}: the text from ${query.values.join(', ')} is blank`);
      continue;
    }
    if (query.type === 'card' || query.type === 'multiRowCard') {
      // A card of a column only (no measure) shows the column; one with measures shows the measures.
      if (!lines.length || lines[0]!.slice(query.values.length ? groups : 0).every(blank)) problems.push(`${where(query)}: the card shows "(Blank)" (${query.values.join(', ')})`);
      continue;
    }
    if (!lines.length) { if (!query.drill || query.drill.value) notes.push(`${where(query)}: empty`); continue; }
    if (query.type === 'slicer') {
      // A blank value is a button or an item "(Blank)" in a slicer.
      if (groups && lines.some((line) => line.slice(0, groups).every(blank))) problems.push(`${where(query)}: the slicer shows "(Blank)" (${query.groups.join(', ')})`);
      continue;
    }
    if (query.pageName === 'selfcheck' && query.visual === 'same') {
      // One word, one number (D366): every pair of numbers of two pages agrees, on the samples as on any data.
      for (const line of lines) if (line.at(-1) !== 'Yes') problems.push(`${where(query)}: "${line[0]}" do not agree (${line[1]} and ${line[2]}): two pages give two numbers for one word`);
    }
    if (query.type === 'tableEx') problems.push(...brokenWords(query, lines));
    if (groups === 0) continue;
    const blankRows = lines.filter((line) => line.slice(0, groups).every(blank)).length;
    if (blankRows) problems.push(`${where(query)}: ${blankRows === 1 ? 'a line' : `${blankRows} lines`} with every column blank (${query.groups.join(', ')})`);
  }
  return { problems, notes };
}

/**
 * What the pictures show wrong (D318): a page that has no tab, a tab that opened another page (the status bar of
 * Desktop says "Page 3 of 17"), a page that shows the words of a broken visual or "(Blank)", a page that takes more
 * than DRAW_SECONDS to draw. A picture step that could not run is a problem too: the
 * check would pass without looking.
 */
export function judgePictures(pictures: Pictures, notes: string[] = []): string[] {
  const problems: string[] = [];
  if (!pictures.taken) return [`The pictures of the pages were not taken: ${pictures.why ?? 'no reason given'}`];
  for (const [index, page] of pictures.pages.entries()) {
    if (!page.found) { problems.push(`${page.displayName}: the picture step found no tab for the page`); continue; }
    const expected = `Page ${index + 1} of ${pictures.pages.length}`;
    if (page.status && page.status !== expected) { problems.push(`${page.displayName}: the picture shows "${page.status}", not "${expected}": the tab did not open the page (picture ${page.file})`); continue; }
    for (const words of page.broken ?? []) problems.push(`${page.displayName}: the page shows "${words}" (picture ${page.file})`);
    for (const tab of page.tabs ?? []) {
      const where = `${page.displayName}, tab ${tab.tab}`;
      if (!tab.found) { problems.push(`${page.displayName}: the picture step found no tab "${tab.tab}" on the page (D323)`); continue; }
      for (const words of tab.broken ?? []) problems.push(`${where}: the tab shows "${words}" (picture ${tab.file})`);
      if (typeof tab.seconds === 'number' && tab.seconds > DRAW_SECONDS) problems.push(`${where}: the tab took ${tab.seconds} s to draw, more than ${DRAW_SECONDS} s (picture ${tab.file})`);
      else notes.push(`${where}: drawn in ${tab.seconds ?? '?'} s (picture ${tab.file})`);
    }
    if (page.seconds !== null && page.seconds > DRAW_SECONDS) problems.push(`${page.displayName}: the page took ${page.seconds} s to draw, more than ${DRAW_SECONDS} s (picture ${page.file})`);
    else notes.push(`${page.displayName}: drawn in ${page.seconds} s (picture ${page.file})`);
  }
  return problems;
}

/**
 * The rules of LOOK §1 on the pages as Desktop draws them (build D6, D328), for every picture of a page and of a tab:
 *   - the page was found on the picture (the navy rail), and its texts were read: a picture without them is a problem,
 *     never a silent pass;
 *   - rule 8: every text has a contrast of 4.5:1 or more on what is behind it;
 *   - rule 2: no text ends with three dots (Power BI cut it).
 * Capitals (rule 1) and the words on a button (rule 4) are checked on the words of the files (pages.ts, rule 11): on a
 * picture most words are data, and a CI name may be in capitals. A text whose box shows one colour only cannot be
 * measured; the notes count those.
 */
export function judgeLook(pictures: Pictures, notes: string[] = []): string[] {
  const problems: string[] = [];
  if (!pictures.taken) return problems;
  const shots = pictures.pages.filter((page) => page.found).flatMap((page) => [
    { where: page.displayName, file: page.file, look: page.look },
    ...(page.tabs ?? []).filter((tab) => tab.found).map((tab) => ({ where: `${page.displayName}, tab ${tab.tab}`, file: tab.file, look: tab.look }))
  ]);
  for (const { where, file, look } of shots) {
    if (!look) { problems.push(`${where}: the picture step gave no look of the page, so its look was not checked (picture ${file})`); continue; }
    if (look.canvas.length !== 4) { problems.push(`${where}: the picture step did not find the page on the screen (no navy rail, or the look step failed: see the log), so its look was not checked (picture ${file})`); continue; }
    if (!look.texts.length) { problems.push(`${where}: no text of the page was read, so its look was not checked (picture ${file})`); continue; }
    let lowest: LookText | undefined;
    let unmeasured = 0;
    for (const text of look.texts) {
      const at = `${where}: "${text.text.slice(0, 60)}" at ${text.x}, ${text.y}`;
      if (text.ratio === null) unmeasured++;
      else {
        if (text.ratio < CONTRAST) problems.push(`${at} has a contrast of ${text.ratio}:1 (${text.colour} on ${text.background}), under ${CONTRAST}:1 (LOOK rule 8, picture ${file})`);
        if (!lowest || text.ratio < lowest.ratio!) lowest = text;
      }
      if (/(\.\.\.|…)$/.test(text.text.trim())) problems.push(`${at} ends with three dots: Power BI cut it (LOOK rule 2, picture ${file})`);
    }
    notes.push(`${where}: ${look.texts.length} texts read${unmeasured ? ` (${unmeasured} of one colour, not measured)` : ''}${lowest ? `, the lowest contrast ${lowest.ratio}:1 ("${lowest.text.slice(0, 40)}", ${lowest.colour} on ${lowest.background})` : ''}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ real size (R4 step 0) */

/** expressions.tmdl with the M of one expression replaced (its lines up to its queryGroup line), in the generator's form. */
export function withExpression(tmdl: string, name: string, m: string): string {
  const block = new RegExp(`^expression ${name} =[\\s\\S]*?\\n(\\tqueryGroup: \\w+\\n)`, 'm');
  const found = block.exec(tmdl);
  if (!found) throw new Error(`expressions.tmdl has no expression ${name}`);
  const body = m.includes('\n') ? `\n${m.split('\n').map((line) => (line ? `\t\t${line}` : '')).join('\n')}` : ` ${m}`;
  return tmdl.slice(0, found.index) + `expression ${name} =${body}\n${found[1]}` + tmdl.slice(found.index + found[0].length);
}

/**
 * expressions.tmdl of the copy Desktop opens, with the invented samples at the size of the real reports (scaled.ts), for
 * the Desktop check at real size (R4 step 0; the repository's files never change):
 *   packed: SampleFiles holds the scaled files, as the timing connector does (no data source, as Sample mode);
 *   folder: SourceMode is SharePoint and the files come from a folder of the runner (Folder.Files, only the folder
 *           itself, as fnSharePointFiles reads the team's folder), so the refresh reads a data source as Carlos's does.
 * With `history` earlier dates, RangeStart moves back to the oldest of them.
 */
export function realSizeExpressions(tmdl: string, mode: 'packed' | 'folder', options: { folder?: string; copies?: number; history?: number } = {}): string {
  const { folder = 'C:\\sacm-real-size', copies = REAL_SIZE_COPIES, history = 0 } = options;
  let out = tmdl;
  if (history > 0) {
    const [year, month, day] = historyStart(history).split('-').map(Number);
    out = out.replace(/^(expression RangeStart = )#datetime\(\d+, \d+, \d+, 0, 0, 0\)/m, `$1#datetime(${year}, ${month}, ${day}, 0, 0, 0)`);
  }
  if (mode === 'packed') {
    const rows = scaledSampleFiles(copies, history).map((file) => `\t{${mText(file.name)}, ${mText(file.base64)}}`).join(',\n');
    return withExpression(out, 'SampleFiles', `#table(type table [FileName = text, Base64 = text], {\n${rows}\n})`);
  }
  const path = folder.replace(/[\\/]+$/, '') + '\\';
  out = out.replace(/^(expression SourceMode = )"Sample"/m, '$1"SharePoint"');
  return withExpression(out, 'fnSharePointFiles', `() as table =>
    let
        files = Folder.Files(${mText(path)}),
        top = Table.SelectRows(files, each Text.Lower([Folder Path], "en-US") = ${mText(path.toLowerCase())}),
        selected = Table.SelectColumns(top, {"Name", "Date modified", "Content"}),
        renamed = Table.RenameColumns(selected, {{"Name", "FileName"}, {"Date modified", "Modified"}})
    in
        Table.TransformColumnTypes(renamed, {{"FileName", type text}, {"Modified", type nullable datetime}, {"Content", type binary}})`);
}

/* ------------------------------------------------------------------ the command line */

if (import.meta.main) {
  const [command, file, extra] = process.argv.slice(2);
  if (command === 'queries' && file) {
    const drills = extra && existsSync(extra) ? new Map(Object.entries(readJson<Record<string, string[]>>(extra))) : new Map<string, string[]>();
    const queries = [...queriesOf(drills), ...blankRowQueries()];
    writeFileSync(file, JSON.stringify({ drillColumns: drillColumns(), queries }, null, 1));
    console.log(`${queries.length} queries of ${new Set(queries.map((query) => `${query.pageName}/${query.visual}`)).size} visuals written to ${file}`);
  } else if (command === 'pages' && file) {
    const pages = pageList();
    writeFileSync(file, JSON.stringify(pages, null, 1));
    console.log(`${pages.length} pages written to ${file}`);
  } else if (command === 'judge' && file) {
    const results = readJson<Results>(file);
    const pictures = extra && existsSync(extra) ? readJson<Pictures>(extra) : undefined;
    // What each visual shows, short, so the log can be read like the pages.
    for (const { query, error, rows } of results.results) {
      if (query.drill?.value) continue;
      const shown = error ? `ERROR ${error.split('\n')[0]}` : `${rows!.length} line${rows!.length === 1 ? '' : 's'}${rows!.length ? ': ' + rows!.slice(0, 3).map((row) => row.map((value) => value ?? '·').join(' | ')).join(' ¶ ') : ''}`;
      console.log(`${query.page} › ${query.visual} [${query.type}] ${shown.slice(0, 300)}`);
    }
    const { problems, notes } = judge(results, pictures);
    if (extra && !pictures) problems.push(`no pictures: ${extra} is missing`);
    for (const note of notes) console.log(`Note: ${note}`);
    for (const problem of problems) console.log(`PROBLEM: ${problem}`);
    console.log(problems.length ? `Desktop check: ${problems.length} problem${problems.length === 1 ? '' : 's'}.` : 'Desktop check: no problem.');
    process.exit(problems.length ? 1 : 0);
  } else if (command === 'realsize' && file && (extra === 'packed' || extra === 'folder')) {
    // file: expressions.tmdl of the copy Desktop opens; the rest: --folder <path> --copies <n> --history <k>.
    const rest = process.argv.slice(5);
    const option = (name: string): string | undefined => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : undefined; };
    const copies = Number(option('--copies') ?? REAL_SIZE_COPIES);
    const history = Number(option('--history') ?? 0);
    // The runner checks out with CRLF: the expressions are matched line by line in LF.
    writeFileSync(file, realSizeExpressions(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), extra, { folder: option('--folder'), copies, history }));
    console.log(`${file}: the samples at real size (${extra}, ${copies} copies, ${history} earlier dates)`);
  } else {
    console.error('Usage: node tools/powerbi/desktop.ts queries <out.json> [drill-values.json] | pages <out.json> | judge <results.json> [pictures.json] | realsize <expressions.tmdl> packed|folder [--folder <path>] [--copies <n>] [--history <k>]');
    process.exit(2);
  }
}
