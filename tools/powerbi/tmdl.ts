/**
 * A small reader for the TMDL files of the Power BI model (powerbi/SACM-Workbench.SemanticModel/definition/). It knows
 * the parts the tools need: the expressions (shared queries), the tables with their columns, measures and the M of their
 * partition. Microsoft's own library checks the whole syntax in `npm run powerbi:lint` (tools/powerbi/tmdl-check/).
 *
 * TMDL is indented with tabs: an object at the start of a line, its properties one tab deeper, and a multi-line
 * expression (M or DAX) one tab deeper than its properties.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MODEL = join(import.meta.dirname, '..', '..', 'powerbi', 'SACM-Workbench.SemanticModel', 'definition');

export interface Expression { name: string; m: string; description: string; queryGroup: string }
export interface Column { name: string; dataType: string; sourceColumn: string }
export interface Measure { name: string; dax: string }
export interface Table { name: string; file: string; columns: Column[]; measures: Measure[]; partitionM: string }

/** A TMDL name: 'Report date' or ReportDate. */
const unquote = (name: string): string => (name.startsWith("'") && name.endsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name);
/** A name as TMDL writes it: quoted when it is not one word. */
export const tmdlName = (name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

const depth = (line: string): number => line.length - line.replace(/^\t+/, '').length;

/** The lines of a multi-line expression that starts after `start` (an object or property at `level`): every following line deeper than its properties, or empty. */
function block(lines: string[], start: number, level: number): { text: string; end: number } {
  const out: string[] = [];
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() !== '' && depth(line) <= level + 1) break;
    out.push(line);
  }
  while (out.length && out[out.length - 1]!.trim() === '') out.pop();
  const cut = level + 2;
  return { text: out.map((line) => line.slice(Math.min(cut, depth(line)))).join('\n'), end: i };
}

/** The value after "name =" on the line itself, else the block below it. */
function valueAt(lines: string[], index: number, level: number): { text: string; end: number } {
  const after = lines[index]!.replace(/^[^=]*=\s?/, '');
  if (after.trim() !== '') return { text: after.trim(), end: index + 1 };
  return block(lines, index, level);
}

/** The expressions of expressions.tmdl, in file order. */
export function readExpressions(file = join(MODEL, 'expressions.tmdl')): Expression[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const out: Expression[] = [];
  let description: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    if (line.startsWith('///')) { description.push(line.slice(3).trim()); i++; continue; }
    const found = /^expression\s+('(?:[^']|'')*'|[^\s=]+)\s*=/.exec(line);
    if (!found) { if (line.trim() && !line.startsWith('\t')) description = []; i++; continue; }
    const value = valueAt(lines, i, 0);
    let queryGroup = '';
    let j = value.end;
    for (; j < lines.length && (lines[j]!.startsWith('\t') || lines[j]!.trim() === ''); j++) {
      const group = /^\tqueryGroup:\s*(.+)$/.exec(lines[j]!);
      if (group) queryGroup = unquote(group[1]!.trim());
    }
    out.push({ name: unquote(found[1]!), m: value.text, description: description.join('\n'), queryGroup });
    description = [];
    i = j;
  }
  return out;
}

/** One table file of tables/. */
export function readTable(file: string): Table {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const head = lines.find((line) => line.startsWith('table '));
  if (!head) throw new Error(`${file}: no "table" line`);
  const table: Table = { name: unquote(head.slice(6).trim()), file, columns: [], measures: [], partitionM: '' };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const column = /^\tcolumn\s+('(?:[^']|'')*'|\S+)\s*$/.exec(line);
    if (column) {
      const name = unquote(column[1]!);
      let dataType = '';
      let sourceColumn = '';
      for (let j = i + 1; j < lines.length && (depth(lines[j]!) >= 2 || lines[j]!.trim() === ''); j++) {
        const property = /^\t\t(dataType|sourceColumn):\s*(.+)$/.exec(lines[j]!);
        if (property?.[1] === 'dataType') dataType = property[2]!.trim();
        if (property?.[1] === 'sourceColumn') sourceColumn = unquote(property[2]!.trim());
      }
      table.columns.push({ name, dataType, sourceColumn: sourceColumn || name });
      continue;
    }
    const measure = /^\tmeasure\s+('(?:[^']|'')*'|[^\s=]+)\s*=/.exec(line);
    if (measure) { table.measures.push({ name: unquote(measure[1]!), dax: valueAt(lines, i, 1).text }); continue; }
    if (/^\t\tsource\s*=/.test(line) && /^\tpartition\s/.test(lines.slice(0, i).reverse().find((before) => /^\t\S/.test(before)) ?? '')) {
      table.partitionM = valueAt(lines, i, 2).text;
    }
  }
  return table;
}

/** Every table of tables/, sorted by file name. */
export function readTables(folder = join(MODEL, 'tables')): Table[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((file) => file.endsWith('.tmdl')).sort().map((file) => readTable(join(folder, file)));
}
