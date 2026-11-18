// Fingerprint of a set of real report files, for the cleanup pieces: the same files must give the same fingerprint
// before and after a change. It prints counts and one checksum per part of the result, never a value from the files.
// The files and the fingerprint stay on the developer's computer: never commit or paste them.
//   node tools/fingerprint.ts <CI report> <Relationship report> <EPO systems report> <Solusi contract file> <ServiceNow contract report> [earlier Solusi contract file]
// The type of each file is found from its columns; the order does not matter. Without an earlier Solusi file, the
// Solusi file is compared with itself on the page Contract changes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { readTable } from '../src/core/reading/table.ts';
import { recogniseReport } from '../src/core/sources/report-types.ts';
import { recordReports } from '../tests/sample-record.ts';
import type { RecordFile, RecordFiles } from '../tests/sample-record.ts';

const found: Partial<Record<string, RecordFile>> = {};
const solusi: RecordFile[] = [];
for (const [index, path] of process.argv.slice(2).entries()) {
  const table = await readTable(new Uint8Array(readFileSync(path)), async (data) => new Uint8Array(inflateRawSync(data)));
  const kind = recogniseReport(table.rows[0] ?? []).type?.kind;
  if (!kind) { console.error(`File ${index + 1}: not a known report type.`); process.exit(1); }
  const file = { path, name: `${kind}-${kind === 'solusi' ? solusi.length + 1 : 1}.file` };
  if (kind === 'solusi') solusi.push(file); else found[kind] = file;
}
const need = ['ci', 'relationship', 'epo', 'contract'] as const;
const missing = need.filter((kind) => !found[kind]).concat(solusi.length ? [] : ['solusi' as never]);
if (missing.length) { console.error(`Missing: ${missing.join(', ')}.`); process.exit(1); }
const files: RecordFiles = { ci: found.ci!, relationship: found.relationship!, epo: found.epo!, contracts: found.contract!, solusi: solusi[0]!, solusiEarlier: solusi[1] ?? solusi[0]! };
const result = await recordReports(files);
const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);
const run = JSON.parse(result['run.json']!) as { cis: number; facts: unknown[] };
const cases = JSON.parse(result['cases.json']!) as Array<{ state: string }>;
console.log(`CIs ${run.cis}, facts ${run.facts.length}, cases ${cases.length} (to solve ${cases.filter((item) => item.state === 'open').length}), messages ${(result['messages.txt']!.match(/^===== SACM-REC-/gm) ?? []).length}`);
for (const [name, text] of Object.entries(result).sort(([a], [b]) => a.localeCompare(b))) console.log(`${sha(text)}  ${name}`);
console.log(`${sha(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)).map(([name, text]) => `${name}\n${text}`).join('\n'))}  ALL`);
