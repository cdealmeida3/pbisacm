// The invented samples made as big as the team's real reports (plan, risk "Power Query is slow on the relationship
// checks": about 3,200 CIs and 5,100 relationships), to time a refresh on the Windows runner. Each copy of the sample CI
// report gets its names with "C<n> " in front; each copy of the Relationship report links the CIs of its copy, and once
// more a parent of its copy to a child of the next copy, so there are about 1.6 relationships per CI, as in the real
// reports. Everything stays invented: only names of the samples, with a number in front. The other reports are as they are.
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/core/reading/csv.ts';
import { EARLIER, RECORD_DATE, SAMPLE_FILES } from '../../tests/sample-record.ts';

/** About 3,200 CIs: 170 copies of the 19 sample CIs. */
export const REAL_SIZE_COPIES = 170;

const cell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = (rows: string[][]): string => rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
const copyName = (name: string, copy: number): string => (copy === 0 || name === '' ? name : `C${copy} ${name}`);

/** The rows of a sample CSV file: the header and the rows. */
function sample(path: string): { header: string[]; rows: string[][] } {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return { header: header!, rows };
}

/** The sample files at real size, each with the name it would have in the SharePoint folder, as base64. */
export function scaledSampleFiles(copies = REAL_SIZE_COPIES): Array<{ name: string; base64: string }> {
  const ci = sample(SAMPLE_FILES.ci.path);
  const name = ci.header.indexOf('name');
  const cis = Array.from({ length: copies }, (_, copy) => ci.rows.map((row) => row.map((value, at) => (at === name ? copyName(value, copy) : value)))).flat();

  const rel = sample(SAMPLE_FILES.relationship.path);
  const parent = rel.header.indexOf('Parent');
  const child = rel.header.indexOf('Child');
  const linked = (row: string[], parentCopy: number, childCopy: number): string[] =>
    row.map((value, at) => (at === parent ? copyName(value, parentCopy) : at === child ? copyName(value, childCopy) : value));
  const relationships = Array.from({ length: copies }, (_, copy) => [
    ...rel.rows.map((row) => linked(row, copy, copy)),
    ...rel.rows.map((row) => linked(row, copy, (copy + 1) % copies))
  ]).flat();

  const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
  const asIs = (file: { path: string; name: string }, date: string) => ({ name: `${date}_${file.name}`, base64: readFileSync(file.path).toString('base64') });
  const { ci: _ci, relationship: _relationship, solusiEarlier, ...rest } = SAMPLE_FILES;
  return [
    { name: `${RECORD_DATE}_${SAMPLE_FILES.ci.name}`, base64: base64(csv([ci.header, ...cis])) },
    { name: `${RECORD_DATE}_${SAMPLE_FILES.relationship.name}`, base64: base64(csv([rel.header, ...relationships])) },
    ...Object.values(rest).map((file) => asIs(file, RECORD_DATE)),
    asIs(solusiEarlier, EARLIER)
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** How many CIs and relationships the scaled samples hold. */
export function scaledSizes(copies = REAL_SIZE_COPIES): { cis: number; relationships: number } {
  return { cis: sample(SAMPLE_FILES.ci.path).rows.length * copies, relationships: sample(SAMPLE_FILES.relationship.path).rows.length * 2 * copies };
}
