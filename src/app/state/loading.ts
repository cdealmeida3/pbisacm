import { screenDate } from '../../core/shared/dates.ts';
import { runChecks } from '../../core/checks/engine.ts';
import { withTeamDays } from '../../core/checks/detectors/ci-detectors.ts';
import { hiddenNotes, readCiReport } from '../../core/sources/ci/ci-report.ts';
import { buildRun } from '../../core/cases/cases.ts';
import { REPORT_TYPES, recogniseReport, unhandledKind } from '../../core/sources/report-types.ts';
import { capabilitySheet } from '../../core/mapping/capability-sheet.ts';
import { hiddenNames, readRelationshipReport } from '../../core/sources/relationships/relationship-report.ts';
import { epoConfig, readEpoReport } from '../../core/sources/epo/epo-report.ts';
import { contractConfig, readContractReport, readSolusiFile } from '../../core/sources/contracts/contract-reports.ts';
import { dateInName, localDate, reportCandidates, runFileName, safeName } from '../../core/memory/finder.ts';
import { loadersOf, writeTeam } from '../../core/team/team.ts';
import { archiveFolderOf, journalPath, monthOf, removedFolderOf, runFolder, splitRuns, writeJournal } from '../../core/memory/memory.ts';
import { buildDrafts, escalationOf } from '../../core/messages/messages.ts';
import { tableOf } from '../platform/files.ts';
import { MemoryWorkspace } from '../platform/workspace.ts';
import { peopleOf } from '../view/people.ts';
import { cardSummaries, cardTotals, findingsText, laterText, notToSolveText } from '../view/cards.ts';
import { toSolve } from '../view/cases.ts';
import { askable } from '../view/fix-list.ts';
import { plural } from '../../core/shared/text.ts';
import { content } from './content.ts';
import { isMonth, jsonNames, previousEpoDate, previousSolusi } from './folder-files.ts';
import { maintain, refresh, start } from './folder.ts';
import { record } from './journal.ts';
import { FILES_LABEL, changed, latestRun, localTime, state, toast } from './store.ts';
import type { EpoRun } from '../../core/sources/epo/epo-report.ts';
import type { ContractInput, ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';
import type { DatedReport, ReportFile } from '../../core/memory/finder.ts';
import type { Recognised, Table } from '../../core/reading/table.ts';
import type { KnownReportType, ReportKind } from '../../core/sources/report-types.ts';
import type { RelationshipRun } from '../../core/sources/relationships/relationship-report.ts';
import type { AppRun } from '../view/people.ts';
import type { Case, CaseEvent } from '../../core/cases/cases.ts';

/**
 * Loading reports: from the folder (Load, Choose reports), from picked files, or the invented data of the demo.
 * The type of each file comes from its columns. Removing a load moves it to the archive, never deletes it.
 */

/** A report file to load: from the folder (path) or picked in the file dialog. */
export interface ReportSource { name: string; path: string; date: string; modified?: number; bytes: () => Promise<Uint8Array | null> }

/** A load of one file: a line for the manager, and whether something was saved. */
interface Loaded { ok: boolean; kind: ReportKind | ''; text: string }

/** The name of a load, without folder and extension: the same report loaded twice has the same stem. */
const stemOf = (date: string, name: string): string => runFileName(date, name).replace(/\.json$/, '');

/** Files of a folder by stem. */
async function stems(folder: string): Promise<string[]> {
  return jsonNames(await state.workspace!.list(folder)).map((name) => name.replace(/\.json$/i, ''));
}

/** The loads saved in the folder (active and archived, every kind) and the loads a manager removed, by stem. */
export async function knownLoads(): Promise<{ loaded: Set<string>; removed: Set<string> }> {
  const loaded = new Set<string>();
  const removed = new Set<string>();
  for (const kind of REPORT_TYPES.map((type) => type.kind)) for (const stem of await stems(runFolder(kind))) loaded.add(stem);
  for (const month of (await state.workspace!.listFolders('data/archive')).filter(isMonth)) {
    for (const kind of REPORT_TYPES.map((type) => type.kind)) for (const stem of await stems(archiveFolderOf(`${month}-01`, kind))) loaded.add(stem);
    for (const stem of await stems(removedFolderOf(`${month}-01`))) removed.add(stem);
  }
  return { loaded, removed };
}

/** The type of a file found from its header row; kept for the session, by path and last change. */
const recognised = new Map<string, Recognised<KnownReportType> & { error?: string }>();

async function readSource(source: ReportSource): Promise<{ table: Table | null; error: string }> {
  try {
    const bytes = await source.bytes();
    if (!bytes) return { table: null, error: `${source.name} cannot be read.` };
    return { table: await tableOf(bytes), error: '' };
  } catch (error) {
    return { table: null, error: `${source.name} cannot be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Saves a Relationship report. Older loads beyond the last ACTIVE_RUNS move to the archive. */
async function saveRelationships(source: ReportSource, table: Table): Promise<Loaded> {
  const read = readRelationshipReport(table.rows);
  if (!read.relationships.length) return { ok: false, kind: 'relationship', text: `${source.name}: a Relationship report, but no row has both a parent and a child.` };
  const run: RelationshipRun = {
    kind: 'relationship', date: source.date, report: source.name,
    relationships: read.relationships, notes: read.notes
  };
  const folder = runFolder('relationship');
  const file = runFileName(source.date, source.name);
  await state.workspace!.writeText(`${folder}/${file}`, JSON.stringify(run));
  const { archive } = splitRuns(jsonNames(await state.workspace!.list(folder)));
  for (const old of archive) {
    await state.workspace!.writeText(`${archiveFolderOf(old, 'relationship')}/${old}`, await state.workspace!.readText(`${folder}/${old}`));
    await state.workspace!.remove(`${folder}/${old}`);
  }
  state.relationship = latestOf([run, state.relationship]);
  await record('report', [], { text: `Loaded the Relationship report ${source.name} (report of ${source.date})`, ref: file });
  const hidden = hiddenNames(read.relationships).size;
  return {
    ok: true, kind: 'relationship',
    text: `${source.name} (Relationship report of ${screenDate(source.date)}): ${read.relationships.length.toLocaleString('en-GB')} relationships.${hidden ? ` ${plural(hidden, 'name')} ${hidden === 1 ? 'holds a hidden character; it is' : 'hold a hidden character; they are'} matched without it.` : ''}`
  };
}

/** Saves an EPO systems report (version 0.14). Older loads beyond the last ACTIVE_RUNS move to the archive. */
async function saveEpo(source: ReportSource, table: Table): Promise<Loaded> {
  const config = epoConfig(content.references);
  if (!config) return { ok: false, kind: 'epo', text: `${source.name}: an EPO systems report, but the reference data to read it is missing (reference/epo-systems-report).` };
  const read = readEpoReport(table.rows, config);
  if (!read.systems.length) return { ok: false, kind: 'epo', text: `${source.name}: an EPO systems report, but no row has an EPO ID.` };
  const run: EpoRun = { kind: 'epo', date: source.date, report: source.name, systems: read.systems, notes: read.notes };
  const folder = runFolder('epo');
  const file = runFileName(source.date, source.name);
  await state.workspace!.writeText(`${folder}/${file}`, JSON.stringify(run));
  const files = jsonNames(await state.workspace!.list(folder));
  const { archive } = splitRuns(files);
  for (const old of archive) {
    await state.workspace!.writeText(`${archiveFolderOf(old, 'epo')}/${old}`, await state.workspace!.readText(`${folder}/${old}`));
    await state.workspace!.remove(`${folder}/${old}`);
  }
  if (!state.epo || state.epo.date <= run.date) { state.epo = run; state.epoPrevious = previousEpoDate(files.sort(), run); }
  await record('report', [], { text: `Loaded the EPO systems report ${source.name} (report of ${source.date})`, ref: file });
  return {
    ok: true, kind: 'epo',
    text: `${source.name} (EPO systems report of ${screenDate(source.date)}): ${read.systems.length.toLocaleString('en-GB')} systems.${read.notes.length ? ` ${read.notes.join(' ')}` : ''}`
  };
}

/**
 * Saves a Solusi contract file or a ServiceNow contract report (version 0.15). Older loads beyond the last ACTIVE_RUNS move
 * to the archive. The contract checks run when a CI report is loaded, like the relationship and the EPO checks.
 */
async function saveContractFile(kind: 'solusi' | 'contract', source: ReportSource, table: Table): Promise<Loaded> {
  const label = kind === 'solusi' ? 'Solusi contract file' : 'ServiceNow contract report';
  const config = contractConfig(content.references);
  if (!config) return { ok: false, kind, text: `${source.name}: a ${label}, but the reference data to read it is missing (reference/contract-reports).` };
  const read = kind === 'solusi' ? readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], config) : readContractReport(table.rows, config);
  if (!read.contracts.length) return { ok: false, kind, text: `${source.name}: a ${label}, but no row has a contract number.` };
  const run = { kind, date: source.date, report: source.name, contracts: read.contracts, notes: read.notes } as SolusiRun | ContractRun;
  const folder = runFolder(kind);
  const file = runFileName(source.date, source.name);
  await state.workspace!.writeText(`${folder}/${file}`, JSON.stringify(run));
  const { archive } = splitRuns(jsonNames(await state.workspace!.list(folder)));
  for (const old of archive) {
    await state.workspace!.writeText(`${archiveFolderOf(old, kind)}/${old}`, await state.workspace!.readText(`${folder}/${old}`));
    await state.workspace!.remove(`${folder}/${old}`);
  }
  if (run.kind === 'solusi') { if (!state.solusi || state.solusi.date <= run.date) { state.solusi = run; state.solusiPrevious = await previousSolusi(); } }
  else if (!state.contracts || state.contracts.date <= run.date) state.contracts = run;
  await record('report', [], { text: `Loaded the ${label} ${source.name} (${kind === 'solusi' ? 'file' : 'report'} of ${source.date})`, ref: file });
  const terminated = run.kind === 'solusi' ? run.contracts.filter((contract) => contract.sheet === 'terminated').length : 0;
  return {
    ok: true, kind,
    text: `${source.name} (${label} of ${screenDate(source.date)}): ${read.contracts.length.toLocaleString('en-GB')} contracts${run.kind === 'solusi' ? `, ${terminated} of them terminated in the last 7 days` : ''}.${read.notes.length ? ` ${read.notes.join(' ')}` : ''}`
  };
}

/** What the contract checks get: the newest of each contract file. */
export const contractInput = (): ContractInput => ({
  solusi: state.solusi ? { contracts: state.solusi.contracts, date: state.solusi.date, report: state.solusi.report } : null,
  servicenow: state.contracts ? { contracts: state.contracts.contracts, date: state.contracts.date, report: state.contracts.report } : null
});

/** Checks a CI report and saves it as a run. */
async function saveCiRun(source: ReportSource, table: Table): Promise<Loaded> {
  const known = !table.lossless && state.relationship ? hiddenNames(state.relationship.relationships) : undefined;
  const report = readCiReport(table.rows, { lossless: table.lossless, knownHidden: known });
  if (!report.cis.length) return { ok: false, kind: 'ci', text: `${source.name}: a CI report, but no row has a name.` };
  // The relationship checks use the newest Relationship report loaded with or before this CI report.
  const relationships = state.relationship ? state.relationship.relationships : null;
  // The days of the lifecycle cards are team settings.
  const references = withTeamDays(content.references, state.settings as unknown as Record<string, unknown>);
  // The EPO checks use the newest EPO systems report loaded with or before it.
  const epo = state.epo ? { systems: state.epo.systems, date: state.epo.date, report: state.epo.report, previousDate: state.epoPrevious } : null;
  // The contract checks use the newest Solusi contract file and ServiceNow contract report loaded with or before it.
  const result = runChecks(report.cis, report.columns, content.packs, references, { relationships, date: source.date, epo, contracts: contractInput() });
  const core = buildRun(report.cis, result, content.packs, source.date, source.name, references);
  core.notes.push(...hiddenNotes(report));
  if (state.relationship) {
    core.relationshipReport = state.relationship.report;
    const days = Math.abs(Date.parse(`${source.date}T00:00:00Z`) - Date.parse(`${state.relationship.date}T00:00:00Z`)) / 86400000;
    if (days > 3) core.notes.push(`RELATIONSHIPS: The relationship checks used the Relationship report of ${screenDate(state.relationship.date)}, ${Math.round(days)} days from this CI report. Load reports of the same day for the best result.`);
  }
  if (state.epo) {
    core.epoReport = state.epo.report;
    const days = Math.abs(Date.parse(`${source.date}T00:00:00Z`) - Date.parse(`${state.epo.date}T00:00:00Z`)) / 86400000;
    if (days > 3) core.notes.push(`EPO: The EPO checks used the EPO systems report of ${screenDate(state.epo.date)}, ${Math.round(days)} days from this CI report. Load reports of the same day for the best result.`);
  }
  if (state.solusi) core.solusiReport = state.solusi.report;
  if (state.contracts) core.contractReport = state.contracts.report;
  // No "loaded by" and no time in the file: who loaded it is in the journal (see fillLoaders).
  // People of every CI with a finding, and of every CI a lifecycle review can draw.
  // The capability sheet (D205) is kept with the run, so its button needs no report file.
  const capabilities = capabilitySheet(report.cis, relationships, references);
  const run: AppRun = {
    ...core, people: peopleOf(report.cis.concat(result.subjects ?? []), core.facts.map((fact) => fact.ciKey).concat((core.inventory ?? []).map((row) => row[0]))),
    ...(capabilities ? { capabilities } : {})
  };
  const file = runFileName(source.date, source.name);
  await state.workspace!.writeText(`data/runs/${file}`, JSON.stringify(run));
  await record('report', [], { text: `Loaded the CI report ${source.name} (report of ${source.date})`, ref: file });
  const hidden = run.facts.filter((fact) => fact.checkId === 'NAME-HIDDEN-CHAR').length;
  return {
    ok: true, kind: 'ci',
    text: `${source.name} (CI report of ${screenDate(source.date)}): ${plural(run.cis, 'CI')} checked.${hidden ? ` ${plural(hidden, 'CI name')} ${hidden === 1 ? 'holds' : 'hold'} a hidden character (see "Hidden character in name").` : ''}${run.notes.length ? ` ${plural(run.notes.length, 'note')} on what could not be tested.` : ''}`
  };
}

/** "63 findings to solve on 3 cards. Not to solve: 15 waiting · 3 known.": the cards of the latest CI report, as the tile counts them. */
function ciTotalsText(): string {
  const cards = cardSummaries(content.packs, latestRun(), state.cases, state.people, state.relationship?.relationships.length, state.epo?.systems.length, !!state.solusi && !!state.contracts);
  const totals = cardTotals(cards);
  const aside = notToSolveText(totals);
  // The parked classes are said too (D179): what is not checked yet.
  const parked = (latestRun()?.parked?.lines ?? []).map((line) => ` ${line}.`).join('');
  const later = laterText(totals);
  return `${findingsText(totals)}${totals.redCards ? ` on ${plural(totals.redCards, 'card')}` : ''}.${later ? ` ${later[0]!.toUpperCase()}${later.slice(1)}.` : ''}${aside ? ` Listed, not to solve: ${aside}.` : ''}${parked}`;
}

const latestOf = (runs: Array<RelationshipRun | null>): RelationshipRun | null =>
  runs.filter((run): run is RelationshipRun => !!run).sort((a, b) => a.date.localeCompare(b.date) || (a.loadedAt ?? '').localeCompare(b.loadedAt ?? '')).pop() ?? null;

/**
 * Loads report files. The type of each comes from its columns. Relationship reports go first, so a CI report from a CSV
 * can use their names to find hidden characters. In demo mode a real file replaces the invented data.
 */
export async function loadSources(sources: ReportSource[], invented = false): Promise<void> {
  if (!sources.length) return;
  if (state.mode === 'demo' && !invented) {
    // A real file replaces the invented data: start again with an empty workspace that keeps nothing.
    await start(new MemoryWorkspace(FILES_LABEL), 'files');
  }
  const read: Array<{ source: ReportSource; table: Table; kind: ReportKind }> = [];
  const lines: string[] = [];
  for (const source of sources) {
    const { table, error } = await readSource(source);
    if (!table) { lines.push(error); continue; }
    // Report files only: keep the picked file in memory, so "Choose reports" lists it and it can be loaded again.
    if (!source.path && state.workspace instanceof MemoryWorkspace) {
      const bytes = await source.bytes();
      if (bytes) state.workspace.keepFile(`reports/${source.name}`, bytes, source.modified ?? Date.now());
    }
    const found = recogniseReport(table.rows[0] ?? []);
    if (!found.type) { lines.push(`${source.name}: ${found.message}`); continue; }
    read.push({ source, table, kind: found.type.kind });
  }
  read.sort((a, b) => Number(a.kind === 'ci') - Number(b.kind === 'ci'));
  let saved = 0;
  // The toast counts reports as the tiles do (F31): one per type, so the demo's two Solusi files are one report.
  const savedKinds = new Set<ReportKind>();
  const ciLines: Array<{ at: number; file: string }> = [];
  for (const item of read) {
    const result = item.kind === 'relationship' ? await saveRelationships(item.source, item.table)
      : item.kind === 'epo' ? await saveEpo(item.source, item.table)
      : item.kind === 'solusi' || item.kind === 'contract' ? await saveContractFile(item.kind, item.source, item.table)
      : item.kind === 'ci' ? await saveCiRun(item.source, item.table)
      : unhandledKind(item.kind);
    lines.push(result.text);
    if (result.ok) { saved += 1; savedKinds.add(item.kind); }
    if (result.ok && result.kind === 'ci') ciLines.push({ at: lines.length - 1, file: runFileName(item.source.date, item.source.name) });
  }
  if (saved) { await maintain(); await refresh(); }
  // The numbers of a CI load are the numbers of the cards (F10): the same words as the CI report tile.
  const latest = latestRun();
  for (const line of ciLines) if (latest && runFileName(latest.date, latest.report) === line.file) lines[line.at] = `${lines[line.at]} ${ciTotalsText()}`;
  state.loadMessages = lines;
  // The result is said under the Reports line; it shows by itself only when something needs a look (a file not loaded).
  // Otherwise the toast says that it happened, with Details (version 0.30).
  state.loadNeedsLook = saved < read.length;
  changed();
  toast(saved ? `${savedKinds.size === 1 ? 'Report' : 'Reports'} loaded` : 'No report was loaded. See the message under Reports.', saved ? DETAILS : null);
}

/** The button of the toast after a load: opens the Reports line, with the tiles and the message of the load. */
const DETAILS = { label: 'Details', run: (): void => { state.reportsShown = true; state.toast = ''; changed(); } };

const fromFile = (file: File): ReportSource => ({
  name: file.name, path: '', modified: file.lastModified, date: dateInName(file.name) || localDate(file.lastModified, new Date().getTimezoneOffset()),
  bytes: async () => new Uint8Array(await file.arrayBuffer())
});

export const loadFiles = (files: File[]): Promise<void> => loadSources(files.map(fromFile));

export interface FolderReport extends DatedReport {
  type: KnownReportType | null;
  /** Why the type is not known. */
  message: string;
  state: 'loaded' | 'removed' | '';
}

/** The report files of reports/ and the workspace folder, newest first, with their type (`limit` files at most are opened). */
export async function folderReports(limit = 20): Promise<{ files: FolderReport[]; more: number }> {
  const workspace = state.workspace!;
  const files: ReportFile[] = (await workspace.list('reports')).map((file) => ({ ...file, path: `reports/${file.name}` }))
    .concat((await workspace.list('')).map((file) => ({ ...file, path: file.name })));
  const candidates = reportCandidates(files, new Date().getTimezoneOffset());
  const { loaded, removed } = await knownLoads();
  const shown: FolderReport[] = [];
  for (const file of candidates.slice(0, limit)) {
    const id = `${file.path}|${file.modified}`;
    let found = recognised.get(id);
    if (!found) {
      const { table, error } = await readSource(sourceOf(file));
      found = table ? recogniseReport(table.rows[0] ?? []) : { type: null, message: error, error };
      recognised.set(id, found);
    }
    const stem = stemOf(file.date, file.name);
    shown.push({ ...file, type: found.type, message: found.message, state: loaded.has(stem) ? 'loaded' : removed.has(stem) ? 'removed' : '' });
  }
  return { files: shown, more: Math.max(0, candidates.length - limit) };
}

const sourceOf = (file: DatedReport): ReportSource => ({ name: file.name, path: file.path, date: file.date, bytes: () => state.workspace!.readBytes(file.path) });

export const loadFolderReports = (files: DatedReport[], invented = false): Promise<void> => loadSources(files.map(sourceOf), invented);

/** Loads the newest report of each type from reports/ and the workspace folder, unless it was loaded (or removed) before. */
export async function loadLatestReport(): Promise<void> {
  const { files } = await folderReports(30);
  if (!files.length) { toast('No .csv or .xlsx file in the "reports" folder or the workspace folder yet. Use "Choose reports" to choose a file.'); return; }
  const lines: string[] = [];
  const toLoad: FolderReport[] = [];
  for (const type of REPORT_TYPES) {
    const newest = files.filter((file) => file.type?.kind === type.kind)[0];
    if (!newest) continue;
    if (newest.state === 'loaded') {
      const first = loadersOf(state.events, runFileName(newest.date, newest.name)).first;
      lines.push(`The newest ${type.label}, ${newest.path} (report of ${screenDate(newest.date)}), is already loaded${first ? ` by ${first.byName || first.by} at ${localTime(first.at)}` : ''}.`);
    }
    else if (newest.state === 'removed') lines.push(`The newest ${type.label}, ${newest.path} (report of ${screenDate(newest.date)}), was removed. Use "Choose reports" to load it again.`);
    else toLoad.push(newest);
  }
  const unknown = files.filter((file) => !file.type).map((file) => file.path);
  if (unknown.length) lines.push(`Not a known report: ${unknown.join(', ')}.`);
  if (toLoad.length) {
    await loadFolderReports(toLoad);
    state.loadMessages = state.loadMessages.concat(lines);
    changed();
    return;
  }
  state.loadMessages = lines.length ? lines : ['No report could be loaded.'];
  state.loadNeedsLook = false;
  changed();
  toast('Nothing new to load', DETAILS);
}

/**
 * Run the checks again (F12, F13): loads the CI report of the latest checks again, from the folder, so its checks use the
 * reports loaded now. The same path as ticking that file in "Choose reports"; only on a button press (D2).
 */
export async function runChecksAgain(): Promise<void> {
  const run = latestRun();
  if (!run) return;
  const { files } = await folderReports(50);
  const ci = files.filter((file) => file.type?.kind === 'ci');
  const file = ci.filter((item) => item.name === run.report && item.date === run.date)[0] ?? ci.filter((item) => item.name === run.report)[0] ?? ci[0];
  if (!file) { toast('The CI report file is no longer in the folder. Use "Choose reports" to choose it.'); return; }
  await loadFolderReports([file], state.mode === 'demo');
}

/**
 * Removes the latest load of one kind (a wrong file). The run moves to data/archive/yyyy-mm/removed/, never deleted;
 * the journal records who removed it, and data/state.json is written again from what stays.
 */
export async function removeLoad(kind: ReportKind): Promise<void> {
  const workspace = state.workspace!;
  const run = kind === 'ci' ? latestRun() : kind === 'epo' ? state.epo : kind === 'solusi' ? state.solusi : kind === 'contract' ? state.contracts
    : kind === 'relationship' ? state.relationship : unhandledKind(kind);
  if (!run) return;
  const file = runFileName(run.date, run.report);
  const from = `${runFolder(kind)}/${file}`;
  const text = await workspace.readText(from);
  if (!text) { toast('This load is no longer in the folder. Press Refresh.'); return; }
  await workspace.writeText(`${removedFolderOf(file)}/${file}`, text);
  await workspace.remove(from);
  await record('report', [], { text: `Removed the load of ${run.report} (report of ${run.date})`, ref: file });
  if (kind === 'relationship') state.relationship = null;
  if (kind === 'epo') { state.epo = null; state.epoPrevious = ''; }
  if (kind === 'solusi') { state.solusi = null; state.solusiPrevious = null; }
  if (kind === 'contract') state.contracts = null;
  await maintain();
  await refresh();
  state.loadNeedsLook = true;
  state.loadMessages = [`Removed the load of ${run.report} (report of ${screenDate(run.date)}).${state.mode === 'folder' ? ` It is kept in ${removedFolderOf(file)}/.` : ''}`];
  changed();
}

export async function startDemo(): Promise<void> {
  const workspace = new MemoryWorkspace();
  await workspace.writeText('reports/cmdb_ci-sample.csv', content.samples.report);
  await workspace.writeText('reports/cmdb_rel_ci-sample.csv', content.samples.relationships);
  await workspace.writeText('reports/epo-systems-sample.csv', content.samples.epo);
  await workspace.writeText('reports/solusi-contracts-sample.csv', content.samples.solusi);
  await workspace.writeText('reports/servicenow-contracts-sample.csv', content.samples.contracts);
  if (!state.user.email) state.user = { name: 'Demo User', email: 'demo.user@example.com' };
  // An invented team, so sharing out and handing over can be tried.
  await workspace.writeText('data/team.json', writeTeam([state.user, { name: 'Alex Example', email: 'alex.example@example.com' }, { name: 'Sam Example', email: 'sam.example@example.com' }]));
  await start(workspace, 'demo');
  // The Solusi contract file of a week earlier, loaded first: the page Contract changes compares the two.
  const earlier = localDate(Date.now() - 7 * 86400000, new Date().getTimezoneOffset());
  await loadSources([{ name: `${earlier}_solusi-contracts-sample.csv`, path: '', date: earlier, modified: Date.now() - 7 * 86400000, bytes: async () => new TextEncoder().encode(content.samples.solusiEarlier) }], true);
  await loadFolderReports((await folderReports()).files, true);
  await demoFollowUp(workspace);
  state.loadMessages = [];
  changed();
}

/**
 * Demo only (F56): an invented follow-up by the example colleague, so a reminder that is due, an escalation and a reply
 * to read can be tried without waiting. Three groups, each on one card: one written to 10 days ago, one written to
 * three times, one that answered. Written as a journal of the colleague in the demo's memory folder; invented names only.
 */
async function demoFollowUp(workspace: MemoryWorkspace): Promise<void> {
  const packOf = (id: string) => content.packs.filter((pack) => pack.id === id)[0];
  const byPerson = new Map<string, Case[]>();
  for (const item of state.cases) {
    if (!toSolve(item) || !item.fact.contactEmail || !packOf(item.fact.checkId)?.playbook.message || !askable(packOf(item.fact.checkId), item)) continue;
    // One group of one card each: the person's points on the other cards stay new, so a first message can be tried too.
    const key = `${item.fact.contactEmail.toLowerCase()}|${item.fact.checkId}`;
    byPerson.set(key, (byPerson.get(key) ?? []).concat([item]));
  }
  const groups = Array.from(byPerson.keys()).sort();
  const personOf = (key: string | undefined): string => (key ?? '').split('|')[0]!;
  // The escalation is shown best on a person asked as Managed by: it goes to the owner of the CI.
  const escalated = groups.filter((key) => byPerson.get(key)!.every((item) => item.fact.contactVia === 'managed by' && !!escalationOf(item.fact, state.settings)))[0] ?? groups[0];
  // Three different people when the sample has them.
  const reminded = groups.filter((key) => personOf(key) !== personOf(escalated))[0] ?? groups.filter((key) => key !== escalated)[0];
  const answered = groups.filter((key) => personOf(key) !== personOf(escalated) && personOf(key) !== personOf(reminded))[0] ?? groups.filter((key) => key !== escalated && key !== reminded)[0];
  const colleague = { by: 'alex.example@example.com', byName: 'Alex Example' };
  const ago = (days: number): string => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
  const events: CaseEvent[] = [];
  const write = (email: string | undefined, name: string, days: number[]): string => {
    const cases = email ? byPerson.get(email)! : [];
    const draft = buildDrafts(cases, content.packs, { ...state.settings, senderName: colleague.byName }, () => `SACM-DEMO${name}`).drafts[0];
    if (!draft) return '';
    days.forEach((day, index) => events.push({
      id: `demo-${name}-${index}`, at: ago(day), ...colleague, type: 'message', keys: draft.keys, ref: draft.ref, to: draft.to, cc: draft.cc,
      subject: index ? `Reminder: ${draft.subject}` : draft.subject, kind: index ? 'reminder' : 'first', channel: 'outlook'
    }));
    return draft.ref;
  };
  write(escalated, 'A', [24, 17, 10]);
  write(reminded, 'B', [10]);
  const ref = write(answered, 'C', [6]);
  // All in this month's journal file of the colleague, also the lines dated last month: the app reads the months since the oldest report.
  if (events.length) await workspace.writeText(journalPath(monthOf(ago(0)), safeName(colleague.by)), writeJournal(events));
  if (ref) {
    await workspace.writeText(`replies/${ref}.json`, JSON.stringify({
      from: personOf(answered), received: ago(2), subject: `RE: ${events[events.length - 1]!.subject}`,
      body: '<p>Hello,</p><p>The new owner starts next month. I will raise the request then.</p><p>(This reply is part of the demo.)</p>'
    }));
  }
  if (events.length) await refresh();
}

/** Report files only: the picked files are read and checked in memory. Nothing is written anywhere. */
export async function startFiles(files: File[]): Promise<void> {
  await start(new MemoryWorkspace(FILES_LABEL), 'files');
  await loadFiles(files);
}
