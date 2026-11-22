// The Power Apps and Power Automate visuals of a report, in words (build A1, D382, plan §6.2):
//   node tools/powerbi/pbix-apps.ts <file.pbix | folder with Report/definition or definition>
// prints, for each visual that is not a native one (an app or the button Refresh now): the page, the kind, the place,
// the fields in order, the filters and whether it has its app link. It prints no id (no app id, environment, flow or
// visual name), so the listing of Carlos's real report and of the invented fixture of the tests can be compared: they
// must be the same. Of a .pbix it reads only the report part (Report/definition), never the data model.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { zipEntries } from '../../src/core/reading/xlsx.ts';
import { NATIVE_TYPES } from './pages.ts';

interface Field { Column?: Named; Measure?: Named; Aggregation?: { Expression?: { Column?: Named } } }
interface Named { Expression?: { SourceRef?: { Entity?: string; Source?: string } }; Property?: string }
interface Filter { field?: Field; type?: string; filter?: { Where?: Array<{ Condition?: unknown }> } }
interface VisualFile {
  position?: Record<string, number>;
  visual?: { visualType?: string; query?: { queryState?: Record<string, { projections?: Array<{ field?: Field }> }> }; objects?: Record<string, Array<{ properties?: Record<string, unknown> }>> };
  filterConfig?: { filters?: Filter[] };
}

/** The files of the report part, by their path under definition/: from a .pbix (a zip) or a folder. */
export function reportFiles(path: string): Map<string, string> {
  const files = new Map<string, string>();
  if (statSync(path).isFile()) {
    const zip = new Uint8Array(readFileSync(path));
    for (const entry of zipEntries(zip)) {
      const name = entry.name.replace(/\\/g, '/');
      if (!name.startsWith('Report/definition/') || name.endsWith('/')) continue;
      const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
      files.set(name.slice('Report/definition/'.length), (entry.method === 8 ? inflateRawSync(data) : Buffer.from(data)).toString('utf8').replace(/^\uFEFF/, ''));
    }
    return files;
  }
  const base = [join(path, 'Report', 'definition'), join(path, 'definition'), path].find((dir) => existsSync(join(dir, 'pages')));
  if (!base) throw new Error(`${path}: no Report/definition/pages`);
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else files.set(`${prefix}${entry.name}`, readFileSync(join(dir, entry.name), 'utf8').replace(/^\uFEFF/, ''));
    }
  };
  walk(base, '');
  return files;
}

const nameOf = (field: Field | undefined): string => {
  if (!field) return '?';
  const inner = field.Aggregation?.Expression?.Column;
  const item = field.Column ?? field.Measure ?? inner;
  const words = `${item?.Expression?.SourceRef?.Entity ?? '?'}.${item?.Property ?? '?'}`;
  return inner ? `${words} (summarized)` : words;
};
/** A filter's condition in words, without the names Desktop gives its sources: "= 1L", "is not blank", "= 'Not followed up'". */
function conditionOf(filter: Filter): string {
  if (!filter.filter) return 'no condition';
  const text = JSON.stringify(filter.filter.Where ?? []);
  const literal = [...text.matchAll(/"Literal":\{"Value":"((?:[^"\\]|\\.)*)"\}/g)].map((match) => match[1]);
  const kind = /"ComparisonKind":(\d)/.exec(text)?.[1];
  const not = /"Not":/.test(text) ? 'not ' : '';
  return `${not}${kind === undefined ? 'condition' : ['=', '>', '>=', '<', '<='][Number(kind)] ?? `kind ${kind}`} ${literal.join(', ') || '(blank)'}`.trim();
}
const round = (value: number | undefined): string => (value === undefined ? '?' : String(Math.round(value * 100) / 100));

/** The lines of the listing: one block per app or button, pages in name order. */
export function appListing(files: Map<string, string>): string[] {
  const lines: string[] = [];
  const visuals = [...files.keys()].filter((path) => /^pages\/[^/]+\/visuals\/[^/]+\/visual\.json$/.test(path)).sort();
  for (const path of visuals) {
    const page = path.split('/')[1]!;
    const json = JSON.parse(files.get(path)!) as VisualFile;
    const type = json.visual?.visualType ?? '';
    if (!type || NATIVE_TYPES.has(type)) continue;
    const display = (JSON.parse(files.get(`pages/${page}/page.json`) ?? '{}') as { displayName?: string }).displayName ?? page;
    const kind = /^PowerApps/i.test(type) ? 'Power Apps' : /^FlowVisual/i.test(type) ? 'Power Automate' : 'other';
    const at = json.position ?? {};
    lines.push(`${display} (${page}): ${kind} at ${round(at.x)}, ${round(at.y)}, ${round(at.width)} x ${round(at.height)}`);
    const fields = Object.values(json.visual?.query?.queryState ?? {}).flatMap((role) => (role.projections ?? []).map((projection) => nameOf(projection.field)));
    lines.push(`  fields (${fields.length}): ${fields.join(', ')}`);
    for (const filter of json.filterConfig?.filters ?? []) lines.push(`  filter ${nameOf(filter.field)}: ${filter.type ?? '?'}, ${conditionOf(filter)}`);
    const objects = json.visual?.objects ?? {};
    const link = (objects.general ?? []).some((entry) => entry.properties && 'appId' in entry.properties) || (objects.flowInfo ?? []).some((entry) => entry.properties && 'FlowId' in entry.properties);
    lines.push(`  link: ${link ? 'yes' : 'no'}; objects: ${Object.keys(objects).sort().join(', ')}`);
  }
  return lines;
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node tools/powerbi/pbix-apps.ts <file.pbix | project folder>'); process.exit(2); }
  for (const line of appListing(reportFiles(path))) console.log(line);
}
