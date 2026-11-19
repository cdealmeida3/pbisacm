// The Desktop check (build B8, D309): every visual of every page, run in the engine of Power BI Desktop on the invented
// samples, as Carlos sees it when he opens the report. The job "powerbi-desktop" (.github/workflows/powerbi.yml) installs
// Power BI Desktop on GitHub's Windows runner, opens the project, refreshes it and runs the query of each visual
// (tools/powerbi/desktop-check/, with Microsoft's client libraries). This file has the two ends, in TypeScript:
//   node tools/powerbi/desktop.ts queries <out.json> [drill.json] the DAX query of every visual (queriesOf), and one per
//                                                                value of a drill-through page (drill.json: the runner's)
//   node tools/powerbi/desktop.ts pages <out.json>               the pages in their order, for the pictures (pictures.ps1)
//   node tools/powerbi/desktop.ts judge <results.json> [pictures.json]
//                                                                what Desktop would show wrong (judge); exit 1 on a problem
// 0.44.0 showed why the lint is not enough: visuals that said "Select or drag fields" (a measure Desktop dropped), a
// card that said "(Blank)", blank rows at the top of tables and lines that exist only because a measure gave text for
// nothing. Only invented data: the job runs in Sample mode.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES_IN_CAPITALS, readTabGroups } from './pages.ts';

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
      for (const drill of runs) {
        const query = queryOf(projections, filters, drillOf(drill));
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

/** One page for the picture step (pictures.ps1, D318): its folder name, its tab, whether the team sees its tab. */
export interface PageEntry { name: string; displayName: string; hidden: boolean; drillThrough: boolean; width: number; height: number; tabs: string[] }

/** The tabs of each page (D323) after its first one, by their words: the picture step presses each and takes a picture. */
function tabsByPage(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of readTabGroups()) out.set(group.page, [...(out.get(group.page) ?? []), ...group.tabs.slice(1).map((tab) => tab.label)]);
  return out;
}

/** Every page in the order of pages.json: the picture step opens each from its tab (a drill-through page shows its empty state). */
export function pageList(): PageEntry[] {
  const order = readJson<{ pageOrder: string[] }>(join(PAGES, 'pages.json')).pageOrder;
  const tabs = tabsByPage();
  return order.map((name) => {
    const page = readJson<{ displayName: string; visibility?: string; width: number; height: number; pageBinding?: { type?: string } }>(join(PAGES, name, 'page.json'));
    return { name, displayName: page.displayName, hidden: page.visibility === 'HiddenInViewMode', drillThrough: page.pageBinding?.type === 'Drillthrough', width: page.width, height: page.height, tabs: tabs.get(name) ?? [] };
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

/** The contrast a text needs (LOOK rule 8, WCAG 2.1 AA): 4.5:1, or 3:1 for large text (24 px, a box of 30 points or more). */
export const CONTRAST = { text: 4.5, large: 3, largeBox: 30 } as const;

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
 *   - the page was found on the picture (the navy rail), and it shows some text;
 *   - rule 8: every text has a contrast of 4.5:1 or more on what is behind it (3:1 for large text);
 *   - rule 2: no text ends with three dots (a text Power BI cut, or written so);
 *   - rule 1: no word in capitals in a sentence (the team's short names apart, NAMES_IN_CAPITALS of pages.ts).
 * The rules of the files (titles and headers that fit, the size of a text, the words on a button) are in pages.ts.
 */
export function judgeLook(pictures: Pictures, notes: string[] = []): string[] {
  const problems: string[] = [];
  if (!pictures.taken) return problems;
  const shots = pictures.pages.flatMap((page) => [
    { where: page.displayName, file: page.file, look: page.look },
    ...(page.tabs ?? []).filter((tab) => tab.found).map((tab) => ({ where: `${page.displayName}, tab ${tab.tab}`, file: tab.file, look: tab.look }))
  ]).filter((shot) => shot.file);
  for (const { where, file, look } of shots) {
    if (!look) continue;
    if (look.canvas.length !== 4) { problems.push(`${where}: the picture step did not find the page on the screen (no navy rail), so its look was not checked (picture ${file})`); continue; }
    if (!look.texts.length) { problems.push(`${where}: no text of the page was read, so its look was not checked (picture ${file})`); continue; }
    let lowest: LookText | undefined;
    for (const text of look.texts) {
      const at = `${where}: "${text.text.slice(0, 60)}" at ${text.x}, ${text.y}`;
      if (text.ratio !== null) {
        const need = text.height >= CONTRAST.largeBox ? CONTRAST.large : CONTRAST.text;
        if (text.ratio < need) problems.push(`${at} has a contrast of ${text.ratio}:1 (${text.colour} on ${text.background}), under ${need}:1 (LOOK rule 8, picture ${file})`);
        if (!lowest || text.ratio < lowest.ratio!) lowest = text;
      }
      if (/(\.\.\.|…)$/.test(text.text.trim())) problems.push(`${at} ends with three dots: it is cut or written so (LOOK rule 2, picture ${file})`);
      const capitals = text.text.match(/\b[A-Z]{2,}\b/g)?.filter((word) => !NAMES_IN_CAPITALS.has(word)) ?? [];
      if (capitals.length && /[a-z]/.test(text.text) && !/\d/.test(text.text)) problems.push(`${at} has the word ${capitals[0]} in capitals (LOOK rule 1, picture ${file})`);
    }
    notes.push(`${where}: ${look.texts.length} texts read${lowest ? `, the lowest contrast ${lowest.ratio}:1 ("${lowest.text.slice(0, 40)}", ${lowest.colour} on ${lowest.background})` : ''}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ the command line */

if (import.meta.main) {
  const [command, file, extra] = process.argv.slice(2);
  if (command === 'queries' && file) {
    const drills = extra && existsSync(extra) ? new Map(Object.entries(readJson<Record<string, string[]>>(extra))) : new Map<string, string[]>();
    const queries = queriesOf(drills);
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
  } else {
    console.error('Usage: node tools/powerbi/desktop.ts queries <out.json> [drill-values.json] | pages <out.json> | judge <results.json> [pictures.json]');
    process.exit(2);
  }
}
