import { parseReply } from '../../core/cases/replies.ts';
import { dateInName } from '../../core/memory/finder.ts';
import { eventsByMonth, parseJournal, rebuildReason, runFolder, writeJournal } from '../../core/memory/memory.ts';
import { state } from './store.ts';
import type { EpoRun } from '../../core/sources/epo/epo-report.ts';
import type { ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';
import type { MemoryState, NamedRun } from '../../core/memory/memory.ts';
import type { CaseEvent, Reply } from '../../core/cases/cases.ts';
import type { AppRun, CiPeople } from '../view/people.ts';
import type { FileInfo } from '../platform/workspace.ts';

/**
 * Reading the team folder: runs, the archive, journals, replies and the summary (data/state.json).
 * Only reads, except migrateJournals, which splits the journals of version 0.5 and older into months.
 */

export function parseJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

export const isMonth = (name: string): boolean => /^\d{4}-\d{2}$/.test(name);
export const jsonNames = (files: FileInfo[]): string[] => files.map((file) => file.name).filter((name) => /\.json$/i.test(name));

export async function readRuns(folder: string, files: string[]): Promise<NamedRun<AppRun>[]> {
  const runs: NamedRun<AppRun>[] = [];
  for (const file of files) {
    const run = parseJson<AppRun>(await state.workspace!.readText(`${folder}/${file}`));
    if (run && Array.isArray(run.facts)) runs.push({ file, run });
  }
  return runs;
}

/** The run files in data/archive/yyyy-mm/. */
export async function archivedRunFiles(): Promise<{ folder: string; file: string }[]> {
  const found: { folder: string; file: string }[] = [];
  for (const month of (await state.workspace!.listFolders('data/archive')).filter(isMonth).sort()) {
    for (const file of jsonNames(await state.workspace!.list(`data/archive/${month}`))) found.push({ folder: `data/archive/${month}`, file });
  }
  return found;
}

export async function readJournalMonths(months: string[]): Promise<CaseEvent[]> {
  const events: CaseEvent[] = [];
  for (const month of months) {
    for (const file of await state.workspace!.list(`data/journal/${month}`)) {
      if (/\.jsonl$/i.test(file.name)) events.push(...parseJournal(await state.workspace!.readText(`data/journal/${month}/${file.name}`)));
    }
  }
  return events;
}

export async function readReplies(folder: string): Promise<{ reply: Reply; text: string }[]> {
  const found: { reply: Reply; text: string }[] = [];
  for (const file of await state.workspace!.list(folder)) {
    const text = await state.workspace!.readText(`${folder}/${file.name}`);
    const reply = parseReply(text, file.name);
    if (reply) found.push({ reply, text });
  }
  return found;
}

export async function readArchivedReplies(): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (const month of (await state.workspace!.listFolders('replies/archive')).filter(isMonth)) {
    replies.push(...(await readReplies(`replies/archive/${month}`)).map((item) => item.reply));
  }
  return replies;
}

/** Journals of version 0.5 and older were one file per person directly in data/journal/: split them into months. */
export async function migrateJournals(): Promise<void> {
  const workspace = state.workspace!;
  for (const file of await workspace.list('data/journal')) {
    if (!/\.jsonl$/i.test(file.name)) continue;
    const old = parseJournal(await workspace.readText(`data/journal/${file.name}`));
    for (const [month, events] of eventsByMonth(old)) {
      const path = `data/journal/${month}/${file.name}`;
      await workspace.writeText(path, writeJournal(parseJournal(await workspace.readText(path)).concat(events)));
    }
    await workspace.remove(`data/journal/${file.name}`);
  }
}

export async function readMemory(): Promise<{ memory: MemoryState<CiPeople> | null; reason: string; active: string[]; others: string[] }> {
  const workspace = state.workspace!;
  const memory = parseJson<MemoryState<CiPeople>>(await workspace.readText('data/state.json'));
  const active = jsonNames(await workspace.list('data/runs'));
  const others = (await workspace.list('data')).map((file) => file.name).filter((name) => /^state.+\.json$/i.test(name));
  const reason = rebuildReason(memory, (await archivedRunFiles()).map((item) => item.file), active, others);
  return { memory: reason ? null : memory, reason, active, others };
}

/** The newest load of a contract file kind in the folder, or null. */
export async function newestRun<R extends SolusiRun | ContractRun>(kind: 'solusi' | 'contract'): Promise<R | null> {
  const files = jsonNames(await state.workspace!.list(runFolder(kind))).sort();
  const newest = files[files.length - 1];
  const run = newest ? parseJson<R>(await state.workspace!.readText(`${runFolder(kind)}/${newest}`)) : null;
  return run && Array.isArray(run.contracts) ? run : null;
}

/** The Solusi contract file loaded before the newest one (an earlier file date), or null. */
export async function previousSolusi(): Promise<SolusiRun | null> {
  if (!state.solusi) return null;
  const newest = state.solusi.date;
  const earlier = jsonNames(await state.workspace!.list(runFolder('solusi'))).filter((name) => { const date = dateInName(name); return !!date && date < newest; }).sort().pop();
  const run = earlier ? parseJson<SolusiRun>(await state.workspace!.readText(`${runFolder('solusi')}/${earlier}`)) : null;
  return run && Array.isArray(run.contracts) ? run : null;
}

/** The date of the EPO report loaded before the newest one, from the file names (they start with the report date). */
export function previousEpoDate(files: string[], newest: EpoRun | null): string {
  if (!newest) return '';
  return files.map((name) => dateInName(name)).filter((date) => !!date && date < newest.date).sort().pop() ?? '';
}
