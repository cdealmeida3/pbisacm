import { buildCases } from '../../core/cases/cases.ts';
import { REVIEW_FOLDER, parseReview } from '../../core/audit/lifecycle-review.ts';
import { runFileName } from '../../core/memory/finder.ts';
import { loadersOf, parseTeam } from '../../core/team/team.ts';
import { ACTIVE_RUNS, archiveFolderOf, compact, handledReplies, monthOf, replyArchiveOf, runFolder, splitRuns } from '../../core/memory/memory.ts';
import { tidyFolder } from './conflicts.ts';
import { archivedRunFiles, isMonth, jsonNames, migrateJournals, newestRun, parseJson, previousEpoDate, previousSolusi, readArchivedReplies, readJournalMonths, readMemory, readReplies, readRuns } from './folder-files.ts';
import { changed, latestRun, nowStamp, readSettings, rebuild, state, toast, today, unusableSettings } from './store.ts';
import { markVisit } from './team.ts';
import type { Review } from '../../core/audit/lifecycle-review.ts';
import type { RelationshipRun } from '../../core/sources/relationships/relationship-report.ts';
import type { EpoRun } from '../../core/sources/epo/epo-report.ts';
import type { ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';
import type { AppRun } from '../view/people.ts';
import type { Mode, OutboxMessage, Settings } from './store.ts';
import type { Workspace } from '../platform/workspace.ts';

/**
 * Opening the team folder and reading it again: start, refresh, and the upkeep of the shared memory (maintain).
 */

/**
 * Archives the runs beyond the last ACTIVE_RUNS, moves handled replies to replies/archive/, and writes data/state.json.
 * Called when a report is loaded, and when the folder is opened and the memory needs it (first open of an older
 * workspace, a missing or clashing state.json). Returns why state.json was rebuilt, or ''.
 */
export async function maintain(): Promise<string> {
  const workspace = state.workspace!;
  const { memory: prior, reason, others } = await readMemory();
  const rules = state.settings;
  const runFiles = jsonNames(await workspace.list('data/runs'));
  const { active, archive } = splitRuns(runFiles);
  const activeRuns = (await readRuns('data/runs', active)).map((item) => item.run);
  const moving = await readRuns('data/runs', archive);
  for (const item of moving) {
    await workspace.writeText(`${archiveFolderOf(item.file)}/${item.file}`, JSON.stringify(item.run));
    await workspace.remove(`data/runs/${item.file}`);
  }
  const archived = await archivedRunFiles();
  const foldRuns = prior ? moving.map((item) => item.run) : [];
  if (!prior) for (const item of archived) foldRuns.push(...(await readRuns(item.folder, [item.file])).map((found) => found.run));

  const oldest = activeRuns.map((run) => run.date).sort()[0] ?? today();
  const journalFrom = [prior?.journalFrom ?? '', monthOf(oldest)].sort().pop()!;
  const months = (await workspace.listFolders('data/journal')).filter(isMonth).filter((month) => !prior || month >= prior.journalFrom);
  const events = await readJournalMonths(months);
  const open = await readReplies('replies');
  const archivedReplies = prior ? [] : await readArchivedReplies();
  const base = {
    prior, foldRuns, foldEvents: events.filter((event) => monthOf(event.at) < journalFrom),
    active: activeRuns, recentEvents: events.filter((event) => monthOf(event.at) >= journalFrom),
    archivedRuns: archived.map((item) => item.file), journalFrom, today: today(), rules
  };

  // Which replies are handled, from the cases as they stand with this summary.
  const draft = compact({ ...base, foldReplies: archivedReplies, openReplies: open.map((item) => item.reply) });
  const cases = buildCases(activeRuns, draft.events.concat(base.recentEvents), draft.replies.concat(open.map((item) => item.reply)), today(), rules, draft);
  const handled = new Set(handledReplies(open.map((item) => item.reply), cases, journalFrom).map((reply) => reply.file));
  for (const item of open) {
    if (!handled.has(item.reply.file)) continue;
    await workspace.writeText(`${replyArchiveOf(item.reply, monthOf(today()))}/${item.reply.file}`, item.text);
    await workspace.remove(`replies/${item.reply.file}`);
  }
  const summary = compact({
    ...base,
    foldReplies: archivedReplies.concat(open.filter((item) => handled.has(item.reply.file)).map((item) => item.reply)),
    openReplies: open.filter((item) => !handled.has(item.reply.file)).map((item) => item.reply)
  });
  await workspace.writeText('data/state.json', JSON.stringify(summary));
  // Conflict copies are summaries too: the new one replaces them.
  for (const name of others) await workspace.remove(`data/${name}`);
  return reason;
}

/**
 * Reads the active part of the folder again. Called at start and by the buttons; nothing refreshes by itself.
 * Returns a note when the shared memory had to be rebuilt, else ''.
 */
export async function refresh(): Promise<string> {
  const workspace = state.workspace!;
  await migrateJournals();
  const tidied = await tidyFolder();
  const saved = parseJson<Partial<Settings>>(await workspace.readText('data/settings.json'));
  if (saved) state.settings = readSettings(saved, state.settings);
  state.unusableSettings = saved ? unusableSettings(saved) : [];
  state.team = parseTeam(await workspace.readText('data/team.json'));
  let { memory, reason, active } = await readMemory();
  if (reason || active.length > ACTIVE_RUNS) {
    await maintain();
    ({ memory, active } = await readMemory());
  }
  state.memory = memory;
  state.savedRuns = (await readRuns('data/runs', active)).map((item) => item.run);
  state.runs = state.savedRuns;
  const reviews: Review[] = [];
  for (const name of jsonNames(await workspace.list(REVIEW_FOLDER)).sort()) {
    const review = parseReview(await workspace.readText(`${REVIEW_FOLDER}/${name}`));
    // A conflict copy of a review holds the same sample (same bytes): the first file of an id counts.
    if (review && !reviews.some((other) => other.id === review.id)) reviews.push(review);
  }
  state.reviews = reviews;
  const relationshipFiles = jsonNames(await workspace.list(runFolder('relationship'))).sort();
  const newest = relationshipFiles[relationshipFiles.length - 1];
  state.relationship = newest ? parseJson<RelationshipRun>(await workspace.readText(`${runFolder('relationship')}/${newest}`)) : null;
  if (state.relationship && !Array.isArray(state.relationship.relationships)) state.relationship = null;
  const epoFiles = jsonNames(await workspace.list(runFolder('epo'))).sort();
  const newestEpo = epoFiles[epoFiles.length - 1];
  state.epo = newestEpo ? parseJson<EpoRun>(await workspace.readText(`${runFolder('epo')}/${newestEpo}`)) : null;
  if (state.epo && !Array.isArray(state.epo.systems)) state.epo = null;
  state.epoPrevious = previousEpoDate(epoFiles, state.epo);
  state.solusi = await newestRun<SolusiRun>('solusi');
  state.contracts = await newestRun<ContractRun>('contract');
  state.solusiPrevious = await previousSolusi();
  const months = (await workspace.listFolders('data/journal')).filter(isMonth).filter((month) => !memory || month >= memory.journalFrom);
  const recent = await readJournalMonths(months);
  const recentIds = new Set(recent.map((event) => event.id));
  state.events = (memory?.events ?? []).filter((event) => !recentIds.has(event.id)).concat(recent);
  const open = (await readReplies('replies')).map((item) => item.reply);
  const openFiles = new Set(open.map((reply) => reply.file));
  state.replies = (memory?.replies ?? []).filter((reply) => !openFiles.has(reply.file)).concat(open);
  await readOutbox();
  fillLoaders();
  state.folderNotes = Array.from(new Set(state.folderNotes.concat(tidied, doubleLoadNotes()))).filter((note) => !dismissed.has(note));
  const now = new Date();
  state.readAt = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  rebuild();
  return reason ? `The shared memory was rebuilt from the runs and journals, because ${reason}.` : '';
}

/**
 * Reads sent/ and outbox/ again (D162): which messages the sending flow has sent and on which day, and which still wait.
 * Called by Refresh and after every Send; no timer. The app never deletes or moves an outbox file.
 */
export async function readOutbox(): Promise<void> {
  const workspace = state.workspace!;
  const sent = await workspace.list('sent');
  state.sent = new Set(sent.map((file) => file.name));
  // The in-memory folder (demo, tests) has no clock on its files: a message then counts from the day it was recorded.
  state.sentOn = new Map(sent.filter((file) => file.modified > 1e11).map((file) => { const at = new Date(file.modified); return [file.name, new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10)]; }));
  const waiting: OutboxMessage[] = [];
  for (const file of jsonNames(await workspace.list('outbox')).filter((name) => !state.sent.has(name)).sort()) {
    const message = parseJson<{ to?: string; subject?: string; requestedBy?: string; requestedAt?: string }>(await workspace.readText(`outbox/${file}`));
    if (message) waiting.push({ file, to: message.to ?? '', subject: message.subject ?? '', by: message.requestedBy ?? '', at: message.requestedAt ?? '' });
  }
  state.outbox = waiting.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Who loaded each report, from the journal. Runs saved from version 0.11 on do not hold it: two computers that load the
 * same new report before the sync then write the same bytes, and OneDrive keeps no copy. Older runs keep their own fields.
 */
function fillLoaders(): void {
  const fill = (run: AppRun | RelationshipRun | EpoRun | SolusiRun | ContractRun): void => {
    if (run.loadedByName) return;
    const first = loadersOf(state.events, runFileName(run.date, run.report)).first;
    if (first) { run.loadedBy = first.by; run.loadedByName = first.byName || first.by; run.loadedAt = first.at; }
  };
  state.runs.forEach(fill);
  if (state.relationship) fill(state.relationship);
  if (state.epo) fill(state.epo);
  if (state.solusi) fill(state.solusi);
  if (state.contracts) fill(state.contracts);
}

/** "Nia loaded this report at the same moment": two managers loaded the newest report of a kind today. */
function doubleLoadNotes(): string[] {
  const notes: string[] = [];
  const newest: Array<AppRun | RelationshipRun | EpoRun | SolusiRun | ContractRun> = [];
  const ci = latestRun();
  if (ci) newest.push(ci);
  if (state.relationship) newest.push(state.relationship);
  if (state.epo) newest.push(state.epo);
  if (state.solusi) newest.push(state.solusi);
  if (state.contracts) newest.push(state.contracts);
  for (const run of newest) {
    const { first, others } = loadersOf(state.events, runFileName(run.date, run.report));
    const same = others.filter((event) => event.at.slice(0, 10) === nowStamp().slice(0, 10));
    if (!first || !same.length) continue;
    const names = Array.from(new Set(same.map((event) => event.byName || event.by)));
    notes.push(`${names.join(' and ')} loaded ${run.report} at the same moment as ${first.byName || first.by}. One load is kept.`);
  }
  return notes;
}

/** Notes about the folder a manager closed: not shown again until the page is opened again. */
const dismissed = new Set<string>();
export function closeFolderNotes(): void {
  state.folderNotes.forEach((note) => dismissed.add(note));
  state.folderNotes = [];
  changed();
}

export async function start(workspace: Workspace, mode: Mode): Promise<void> {
  state.workspace = workspace;
  state.mode = mode;
  state.relationship = null;
  state.epo = null;
  state.epoPrevious = '';
  state.solusi = null;
  state.contracts = null;
  state.solusiPrevious = null;
  state.loadMessages = [];
  state.folderNotes = [];
  state.since = null;
  state.openCard = '';
  state.openCi = '';
  state.view = 'overview';
  const note = await refresh();
  if (note) toast(note);
  if (!state.user.email) { state.askUser = true; changed(); return; }
  if (mode === 'folder') markVisit();
}
