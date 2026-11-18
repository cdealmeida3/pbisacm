import { screenDate } from '../../core/shared/dates.ts';
import { identityKey } from '../../core/shared/names.ts';
import { slimRun } from '../../core/audit/audit.ts';
import { archivedRunFiles, isMonth, jsonNames, parseJson, readArchivedReplies, readJournalMonths, readReplies } from './folder-files.ts';
import { record } from './journal.ts';
import { state, toast, today } from './store.ts';
import type { CaseEvent, Reply } from '../../core/cases/cases.ts';
import type { SlimRun } from '../../core/audit/audit.ts';
import type { AppRun } from '../view/people.ts';

/**
 * The audit record (version 0.12): Not followed up (an exception with a reason and a review date), and the history the audit export reads.
 */

/** Exception accepted on cases: a reason, a review date and a note. The cases count as closed until the review date. */
export async function acceptException(keys: string[], reason: string, reviewOn: string, note: string): Promise<void> {
  if (!keys.length) return;
  await record('exception', keys, { reason, reviewOn, text: note.trim() });
  toast(`Not followed up until ${screenDate(reviewOn)}.`);
}

/** An exception for a CI before any finding is raised (the known exceptions of the SACM instruction). `checkId` '*' = every check. */
export async function addStandingException(ciName: string, checkId: string, reason: string, reviewOn: string, note: string): Promise<void> {
  const name = ciName.trim();
  if (!name) return;
  await record('exception', [], { ciName: name, ciKey: identityKey(name), checkId, reason, reviewOn, text: note.trim() });
  toast(`${name}: not followed up until ${screenDate(reviewOn)}.`);
}

/** Ends an exception today: the cases are to solve again. Recorded as an exception whose review date is today. */
export async function endException(event: CaseEvent, target: string): Promise<void> {
  const ending = { reason: event.reason || 'Other', reviewOn: today(), text: 'Ended by hand' };
  if (!event.keys.length && event.ciKey) await record('exception', [], { ...ending, ciName: event.ciName, ciKey: event.ciKey, checkId: event.checkId ?? '*' });
  else await record('exception', [target], ending);
}

/** The run before `run` among the active runs, for "new" and "verified since the last report". */
export function previousRun(run: AppRun): AppRun | null {
  const ordered = state.runs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  const at = ordered.indexOf(run);
  return at > 0 ? ordered[at - 1]! : null;
}

/**
 * Everything the audit export needs, read when a manager presses the button: every CI run (data/runs and the
 * archive), every journal month, and every reply (also replies/archive). Runs are made small one by one.
 */
export async function readHistory(): Promise<{ runs: SlimRun[]; events: CaseEvent[]; replies: Reply[]; notes: string[] }> {
  const workspace = state.workspace!;
  const notes: string[] = [];
  const runs: SlimRun[] = [];
  const read = async (folder: string, file: string): Promise<void> => {
    const run = parseJson<AppRun>(await workspace.readText(`${folder}/${file}`));
    if (run && Array.isArray(run.facts) && typeof run.date === 'string') runs.push(slimRun(run));
    else notes.push(`${folder}/${file} could not be read.`);
  };
  for (const file of jsonNames(await workspace.list('data/runs'))) await read('data/runs', file);
  for (const item of await archivedRunFiles()) await read(item.folder, item.file);
  const events = await readJournalMonths((await workspace.listFolders('data/journal')).filter(isMonth).sort());
  const known = new Set(events.map((event) => event.id));
  // Events only kept in the summary (journal files of an older version) still count.
  for (const event of state.memory?.events ?? []) if (!known.has(event.id)) { known.add(event.id); events.push(event); }
  const replies = (await readReplies('replies')).map((item) => item.reply).concat(await readArchivedReplies());
  if (state.mode === 'files') notes.push('Report files only: nothing is saved, so the export holds only what was done since the files were opened.');
  return { runs, events, replies, notes };
}
