/**
 * Command-line host, for development and tests:
 *   node src/hosts/cli.ts <report.csv|.xlsx> [more reports] [previous findings.json]
 * The type of each report comes from its columns (CI report, Relationship report). Prints a summary and writes
 * findings.json next to the CI report.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { dateInName } from '../core/memory/finder.ts';
import { identityKey } from '../core/shared/names.ts';
import { readTable } from '../core/reading/table.ts';
import { recogniseReport, unhandledKind } from '../core/sources/report-types.ts';
import { hiddenNames, matchEnds, readRelationshipReport } from '../core/sources/relationships/relationship-report.ts';
import type { Relationship } from '../core/sources/relationships/relationship-report.ts';
import { checksInUse, compareRuns, runChecks } from '../core/checks/engine.ts';
import { compareEpo, descriptionDifference, epoConfig, readEpoReport } from '../core/sources/epo/epo-report.ts';
import type { EpoInput } from '../core/sources/epo/epo-report.ts';
import { compareContracts, contractConfig, readContractReport, readSolusiFile } from '../core/sources/contracts/contract-reports.ts';
import type { ContractInput } from '../core/sources/contracts/contract-reports.ts';
import { hiddenNotes, readCiReport } from '../core/sources/ci/ci-report.ts';
import { buildCases, buildRun, groupCases, isDaily, moduleScores, stateOf } from '../core/cases/cases.ts';
import { FINDING_STATES, MODULES } from '../core/model/model.ts';
import type { CheckPack, Finding, References } from '../core/model/model.ts';

const root = join(import.meta.dirname, '..', '..');

const inflate = async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data));
const utf8 = new TextDecoder('utf-8');

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The check files: checks/packs/<subject>/<id>.json, in the order of their file names (as the app reads them).
 * `path` is the file relative to checks/packs/.
 */
export function loadPackFiles(from = root): { path: string; pack: unknown }[] {
  const folder = join(from, 'checks', 'packs');
  return readdirSync(folder, { recursive: true, encoding: 'utf8' }).map((file) => file.replace(/\\/g, '/')).filter((file) => file.endsWith('.json'))
    .sort((a, b) => byText(basename(a), basename(b)) || byText(a, b))
    .map((path) => ({ path, pack: JSON.parse(readFileSync(join(folder, path), 'utf8')) as unknown }));
}

export function loadPacks(): CheckPack[] {
  return loadPackFiles().map((file) => file.pack as CheckPack);
}

export function loadReferences(): References {
  const folder = join(root, 'checks', 'reference');
  const references: References = {};
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    references[`reference/${file.replace(/\.json$/, '')}`] = JSON.parse(readFileSync(join(folder, file), 'utf8'));
  }
  return references;
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const previousPath = args.filter((arg) => /\.json$/i.test(arg))[0];
  let reportPath = '';
  let ciTable: Awaited<ReturnType<typeof readTable>> | null = null;
  let relationships: Relationship[] | null = null;
  let epo: EpoInput | null = null;
  const contracts: ContractInput = { solusi: null, servicenow: null };
  const references = loadReferences();
  for (const path of args.filter((arg) => !/\.json$/i.test(arg))) {
    const table = await readTable(new Uint8Array(readFileSync(path)), inflate, (data) => utf8.decode(data));
    const found = recogniseReport(table.rows[0] ?? []);
    if (!found.type) { console.error(`${path}: ${found.message}`); continue; }
    const fileDate = dateInName(basename(path)) || new Date().toISOString().slice(0, 10);
    if (found.type.kind === 'solusi') {
      const read = readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], contractConfig(references)!);
      contracts.solusi = { contracts: read.contracts, date: fileDate, report: basename(path) };
      console.log(`${path}: Solusi contract file (${table.format}), ${read.contracts.length} contracts (${read.contracts.filter((contract) => contract.sheet === 'terminated').length} terminated in the last 7 days).${read.notes.map((note) => ` ${note}`).join('')}`);
    } else if (found.type.kind === 'contract') {
      const read = readContractReport(table.rows, contractConfig(references)!);
      contracts.servicenow = { contracts: read.contracts, date: fileDate, report: basename(path) };
      console.log(`${path}: ServiceNow contract report (${table.format}), ${read.contracts.length} contracts.${read.notes.map((note) => ` ${note}`).join('')}`);
    } else if (found.type.kind === 'epo') {
      const read = readEpoReport(table.rows, epoConfig(references)!);
      epo = { systems: read.systems, date: dateInName(basename(path)) || new Date().toISOString().slice(0, 10), report: basename(path), previousDate: process.env.EPO_PREVIOUS ?? '' };
      console.log(`${path}: EPO systems report (${table.format}), ${read.systems.length} systems.${read.notes.map((note) => ` ${note}`).join('')}`);
    } else if (found.type.kind === 'relationship') {
      const read = readRelationshipReport(table.rows);
      relationships = read.relationships;
      console.log(`${path}: Relationship report (${table.format}), ${read.relationships.length} relationships.${read.notes.map((note) => ` ${note}`).join('')}`);
    } else if (found.type.kind === 'ci') { reportPath = path; ciTable = table; console.log(`${path}: CI report (${table.format}).`); }
    else unhandledKind(found.type);
  }
  if (!ciTable) { console.error('Usage: node src/hosts/cli.ts <report.csv|.xlsx> [more reports] [previous findings.json]. No CI report given.'); process.exit(1); }
  const report = readCiReport(ciTable.rows, { lossless: ciTable.lossless, knownHidden: !ciTable.lossless && relationships ? hiddenNames(relationships) : undefined });
  if (relationships) {
    const match = matchEnds(relationships, report.cis.map((ci) => ci.key));
    const classOf = new Map<string, Set<string>>();
    for (const ci of report.cis) classOf.set(identityKey(ci.name), (classOf.get(identityKey(ci.name)) ?? new Set()).add(ci.className));
    let classDiffers = 0;
    for (const item of relationships) {
      for (const [name, className] of [[item.parent, item.parentClass], [item.child, item.childClass]] as const) {
        const known = classOf.get(identityKey(name));
        if (known && className && !known.has(className)) classDiffers += 1;
      }
    }
    console.log(`Relationship ends: ${match.ends}, not in the CI report: ${match.unmatched}, class differs: ${classDiffers}, names with a hidden character: ${match.hidden}.`);
  }
  console.log(`Hidden characters tested from: ${report.hiddenFrom || 'not tested'}.\n`);
  const packs = checksInUse(loadPacks());
  // The date of the report: the yyyy-MM-dd_ prefix of its name, else today. The checks that count days use it.
  const date = dateInName(basename(reportPath)) || new Date().toISOString().slice(0, 10);
  const result = runChecks(report.cis, report.columns, packs, references, { relationships, date, epo, contracts });
  if (contracts.solusi && contracts.servicenow) {
    const compared = compareContracts(contracts.solusi.contracts, contracts.servicenow.contracts);
    console.log(`Contracts: in both ${compared.pairs.length}, only in ServiceNow ${compared.notInSolusi.length} (+ ${compared.noNumber.length} with no Solusi number), only in Solusi ${compared.notInServiceNow.length}.\n`);
  }
  if (epo) {
    const config = epoConfig(references)!;
    const comparison = compareEpo(report.cis, epo.systems, report.columns, config);
    const of = (mapped: boolean) => comparison.pairs.filter((pair) => pair.mapped === mapped);
    const differing = (pairs: typeof comparison.pairs, field?: string) => pairs.filter((pair) => pair.differences.some((item) => !field || item.field === field)).length;
    console.log(`EPO pairs: ${comparison.pairs.length} (service mapped ${of(true).length}, not mapped ${of(false).length}), Retired on both sides ${comparison.retiredBoth}, live EPO systems without a CI ${comparison.withoutCi.length}.`);
    for (const mapped of [true, false]) {
      const pairs = of(mapped);
      console.log(`  ${mapped ? 'mapped' : 'not mapped'}: ${differing(pairs)} CIs differ, ${pairs.reduce((sum, pair) => sum + pair.differences.length, 0)} fields; status ${differing(pairs, 'status')}, name ${differing(pairs, 'name')}, owned_by ${differing(pairs, 'owned_by')}, managed_by ${differing(pairs, 'managed_by')}, supported_by ${differing(pairs, 'supported_by')}, description ${differing(pairs, 'description')}`);
    }
    const kinds: Record<string, number> = {};
    for (const pair of comparison.pairs) { const kind = descriptionDifference(pair.ci, pair.system, config) || 'same or later'; kinds[kind] = (kinds[kind] ?? 0) + 1; }
    console.log(`  descriptions: ${JSON.stringify(kinds)}\n`);
  }
  const run = buildRun(report.cis, result, packs, date, reportPath, references);
  run.notes.push(...hiddenNotes(report));
  const groups = groupCases(buildCases([run], [], [], run.date, { reminderDays: 3, maxReminders: 2 }));

  console.log(`${report.cis.length} CIs read. ${result.findings.length} findings in ${groups.length} cases.\n`);
  const scores = moduleScores(run, packs);
  for (const module of MODULES) {
    const entry = scores[module];
    console.log(`${module.toUpperCase()}  score ${entry.score === null ? '-' : `${entry.score}%`} (${entry.problems} problems in ${entry.tests} tests)`);
    for (const pack of packs.filter((candidate) => candidate.dimension === module)) {
      const found = result.findings.filter((finding) => finding.checkId === pack.id);
      if (!found.length) continue;
      const cis = new Set(found.map((finding) => finding.ciKey)).size;
      const cases = groups.filter((group) => group.checkId === pack.id).length;
      const facts = run.facts.filter((fact) => fact.checkId === pack.id);
      const by = (wanted: string): number => facts.filter((fact) => stateOf(fact) === wanted).length;
      const other = FINDING_STATES.filter((wanted) => wanted !== 'open' && by(wanted) > 0).map((wanted) => `${by(wanted)} ${wanted}`).join(', ');
      console.log(`  ${pack.id.padEnd(24)} ${String(found.length).padStart(4)} findings on ${String(cis).padStart(4)} CIs, ${cases} cases; ${by('open')} to solve${other ? `, ${other}` : ''}`);
    }
  }
  console.log(`\nTo solve ${run.facts.filter((fact) => stateOf(fact) === 'open').length}, ${FINDING_STATES.filter((wanted) => wanted !== 'open').map((wanted) => `${wanted} ${run.facts.filter((fact) => stateOf(fact) === wanted).length}`).join(', ')}.`);
  // Daily work and what is clarified when there is time (D182): only daily work is in the red number of the first screen.
  const later = new Set(packs.filter((pack) => !isDaily(pack)).map((pack) => pack.id));
  const open = run.facts.filter((fact) => stateOf(fact) === 'open');
  console.log(`Daily work ${open.filter((fact) => !later.has(fact.checkId)).length}, to clarify when there is time ${open.filter((fact) => later.has(fact.checkId)).length}.`);
  for (const line of run.parked?.lines ?? []) console.log(`${line}.`);
  const routed = run.facts.filter((fact) => fact.route === 'epo').length;
  if (routed) console.log(`\n${routed} findings are fixed in EPO; the others in ServiceNow.`);
  if (run.notes.length) console.log('\nNotes:');
  for (const note of run.notes) console.log(`  ${note}`);
  if (previousPath) {
    const changes = compareRuns(JSON.parse(readFileSync(previousPath, 'utf8')) as Finding[], result.findings);
    console.log(`\nSince the previous run: ${changes.opened.length} new, ${changes.still.length} still open, ${changes.resolved.length} resolved.`);
  }
  const output = join(dirname(reportPath), 'findings.json');
  writeFileSync(output, JSON.stringify(result.findings, null, 2) + '\n');
  console.log(`\nWritten: ${output}`);
}
