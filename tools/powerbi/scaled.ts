// The invented samples made as big as the team's real reports (about 3,200 CIs and 5,100 relationships), to time a
// refresh on the Windows runner (tools/powerbi/time.ps1, D283) and to compare the counts with src/core at that size
// (tools/powerbi/parity.ts --real-size). Each copy of the samples looks like real data, not like 170 copies of one file:
//   - names get "C<n> " in front (copy 0 keeps the sample names);
//   - EPO IDs are unique per copy: AST-0001 of copy n is AST-<n × 100 + 1, five digits> (copy 0 keeps AST-0001), in the
//     CI report, in the tag columns of the Relationship report and in the EPO systems report;
//   - a description longer than 20 characters gets " (copy n)" at the end; a description that repeats the name repeats
//     the name of its copy; the short placeholders (TBD, n/a) stay, as real data repeats placeholders;
//   - the EPO systems report is scaled like the CI report (about 1,000 systems);
//   - each copy of the Relationship report links the CIs of its copy, and once more a parent of its copy to a child of
//     the next copy, so there are about 1.6 relationships per CI, as in the real reports.
// People, statuses, tags and criticality stay as in the samples (one person owns many CIs in real data too). The
// contract files stay as they are. Everything stays invented: only the samples, with a number in front.
//   node tools/powerbi/scaled.ts --write <folder> [--copies <n>] [--history <k>]   writes the scaled files as CSV
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../src/core/reading/csv.ts';
import { EARLIER, RECORD_DATE, SAMPLE_FILES } from '../../tests/sample-record.ts';

/** About 3,200 CIs: 170 copies of the 19 sample CIs. */
export const REAL_SIZE_COPIES = 170;

const BOM = '﻿';
const quoted = (value: string, delimiter: string): string =>
  (value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = (rows: string[][], delimiter = ','): string => rows.map((row) => row.map((value) => quoted(value, delimiter)).join(delimiter)).join('\r\n') + '\r\n';

/** A name of copy n. */
export const copyName = (name: string, copy: number): string => (copy === 0 || name === '' ? name : `C${copy} ${name}`);
/** An EPO ID of copy n: AST-0001 becomes AST-00101 in copy 1 and AST-17001 in copy 170. Any other form stays. */
export const copyEpoId = (id: string, copy: number): string => {
  const found = /^(\s*)([A-Za-z]+-)(\d+)(\s*)$/.exec(id);
  if (copy === 0 || !found) return id;
  return `${found[1]}${found[2]}${String(copy * 100 + Number(found[3])).padStart(5, '0')}${found[4]}`;
};
/** A description of copy n: " (copy n)" at the end of a long one (inside a closing HTML tag of EPO), the name of the copy for one that repeats the name. */
export const copyDescription = (text: string, copy: number, name = ''): string => {
  if (copy === 0) return text;
  if (name !== '' && text.trim() === name.trim()) return copyName(text, copy);
  if (text.length <= 20) return text;
  const close = /(<\/[a-z0-9]+>\s*)$/i.exec(text);
  return close ? `${text.slice(0, close.index)} (copy ${copy})${close[1]}` : `${text} (copy ${copy})`;
};

/** The rows of a sample CSV file: the header and the rows, and its delimiter. */
function sample(path: string): { header: string[]; rows: string[][]; delimiter: string; bom: boolean } {
  const text = readFileSync(path, 'utf8');
  const [header, ...rows] = parseCsv(text);
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0]!;
  const delimiter = [';', '\t'].find((candidate) => firstLine.replace(/"[^"]*"/g, '').split(candidate).length > firstLine.replace(/"[^"]*"/g, '').split(',').length) ?? ',';
  return { header: header!, rows, delimiter, bom: text.startsWith(BOM) };
}

/** The position of each column whose header is one of `names` (lower case). */
const positions = (header: string[], names: string[]): number[] =>
  header.map((value, at) => (names.includes(value.trim().toLowerCase()) ? at : -1)).filter((at) => at >= 0);

/** The CI report of the copies, as CSV text. */
function scaledCi(copies: number): string {
  const ci = sample(SAMPLE_FILES.ci.path);
  const name = ci.header.indexOf('name');
  const tag = ci.header.indexOf('asset_tag');
  const description = ci.header.indexOf('short_description');
  const rows = Array.from({ length: copies }, (_, copy) => ci.rows.map((row) => row.map((value, at) =>
    at === name ? copyName(value, copy) : at === tag ? copyEpoId(value, copy) : at === description ? copyDescription(value, copy, row[name]) : value))).flat();
  return csv([ci.header, ...rows]);
}

/** The Relationship report of the copies: the ends of each row are of the copy (the child of the second row of the next copy). */
function scaledRelationships(copies: number): string {
  const rel = sample(SAMPLE_FILES.relationship.path);
  const parent = rel.header.indexOf('Parent');
  const child = rel.header.indexOf('Child');
  // The two "Asset tag" columns after the two "Class" columns: the first is the parent's, the second the child's.
  const tags = positions(rel.header, ['asset tag']);
  const linked = (row: string[], parentCopy: number, childCopy: number): string[] =>
    row.map((value, at) => (at === parent ? copyName(value, parentCopy) : at === child ? copyName(value, childCopy)
      : at === tags[0] ? copyEpoId(value, parentCopy) : at === tags[1] ? copyEpoId(value, childCopy) : value));
  const rows = Array.from({ length: copies }, (_, copy) => [
    ...rel.rows.map((row) => linked(row, copy, copy)),
    ...rel.rows.map((row) => linked(row, copy, (copy + 1) % copies))
  ]).flat();
  return csv([rel.header, ...rows]);
}

/** The EPO systems report of the copies, in the delimiter of the sample. */
function scaledEpo(copies: number): string {
  const epo = sample(SAMPLE_FILES.epo.path);
  const lower = epo.header.map((value) => value.trim().toLowerCase());
  const id = lower.indexOf('epoid');
  const name = lower.indexOf('systemname');
  const description = lower.indexOf('systemdescription');
  const rows = Array.from({ length: copies }, (_, copy) => epo.rows.map((row) => row.map((value, at) =>
    at === id ? copyEpoId(value, copy) : at === name ? copyName(value, copy) : at === description ? copyDescription(value, copy) : value))).flat();
  return (epo.bom ? BOM : '') + csv([epo.header, ...rows], epo.delimiter);
}

/** A date `days` days before the yyyy-mm-dd date. */
const daysBefore = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export interface ScaledFile { name: string; text?: string; base64: string }

/**
 * The sample files at real size, each with the name it would have in the SharePoint folder, as base64 (and as text for
 * the scaled ones). `history`: that many earlier dates of the CI and Relationship report (7, 14, … days before), as the
 * reports folder keeps them (the history build B5 reads).
 */
export function scaledSampleFiles(copies = REAL_SIZE_COPIES, history = 0): ScaledFile[] {
  const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
  const scaled = (name: string, text: string): ScaledFile => ({ name, text, base64: base64(text) });
  const asIs = (file: { path: string; name: string }, date: string): ScaledFile => ({ name: `${date}_${file.name}`, base64: readFileSync(file.path).toString('base64') });
  const ci = scaledCi(copies);
  const relationships = scaledRelationships(copies);
  const dates = [RECORD_DATE, ...Array.from({ length: history }, (_, at) => daysBefore(RECORD_DATE, 7 * (at + 1)))];
  const { ci: _ci, relationship: _relationship, epo: _epo, solusiEarlier, ...rest } = SAMPLE_FILES;
  return [
    ...dates.flatMap((date) => [scaled(`${date}_${SAMPLE_FILES.ci.name}`, ci), scaled(`${date}_${SAMPLE_FILES.relationship.name}`, relationships)]),
    scaled(`${RECORD_DATE}_${SAMPLE_FILES.epo.name}`, scaledEpo(copies)),
    ...Object.values(rest).map((file) => asIs(file, RECORD_DATE)),
    asIs(solusiEarlier, EARLIER)
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** How many CIs, relationships and EPO systems the scaled samples hold. */
export function scaledSizes(copies = REAL_SIZE_COPIES): { cis: number; relationships: number; epoSystems: number } {
  return {
    cis: sample(SAMPLE_FILES.ci.path).rows.length * copies,
    relationships: sample(SAMPLE_FILES.relationship.path).rows.length * 2 * copies,
    epoSystems: sample(SAMPLE_FILES.epo.path).rows.length * copies
  };
}

/** The value after a flag of the command line, as a whole number. */
export const numberArgument = (args: string[], flag: string, fallback: number): number => {
  const at = args.indexOf(flag);
  if (at < 0) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a whole number, got ${args[at + 1] ?? 'nothing'}`);
  return value;
};

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--write');
  if (at < 0 || !args[at + 1]) { console.error('Usage: node tools/powerbi/scaled.ts --write <folder> [--copies <n>] [--history <k>]'); process.exit(2); }
  const folder = args[at + 1]!;
  const copies = numberArgument(args, '--copies', REAL_SIZE_COPIES);
  mkdirSync(folder, { recursive: true });
  const files = scaledSampleFiles(copies, numberArgument(args, '--history', 0));
  for (const file of files) writeFileSync(join(folder, file.name), Buffer.from(file.base64, 'base64'));
  const sizes = scaledSizes(copies);
  console.log(`Scaled samples: ${files.length} files in ${folder}: ${sizes.cis} CIs, ${sizes.relationships} relationships, ${sizes.epoSystems} EPO systems (invented).`);
}
