import { journalPath, monthOf, parseJournal, writeJournal } from '../../core/memory/memory.ts';
import { safeName } from '../../core/memory/finder.ts';
import { changed, nowStamp, rebuild, state, toast } from './store.ts';
import type { CaseEvent, EventType } from '../../core/cases/cases.ts';

/**
 * The journal: what each manager did, one file per person and month (data/journal/yyyy-mm/), so two people never write the same file.
 */

/** Records what a manager did, in that manager's own journal file for this month. */
export async function record(type: EventType, keys: string[], values: Partial<CaseEvent> = {}): Promise<void> {
  await recordAll([{ type, keys, values }]);
}

/** Records several actions with one write of the journal (Share out this card, Hand over). */
export async function recordAll(entries: Array<{ type: EventType; keys: string[]; values?: Partial<CaseEvent> }>): Promise<void> {
  // Nothing is written without a name and an email: a journal needs its owner (else it would be data/journal/yyyy-mm/.jsonl).
  if (!state.user.email) { state.askUser = true; changed(); toast('Please say who is working first.'); return; }
  const events = entries.filter((entry) => entry.keys.length || entry.type === 'report' || entry.type === 'person-note' || entry.type === 'settings' || entry.type === 'exception' || entry.type === 'review')
    .map((entry): CaseEvent => ({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: nowStamp(), by: state.user.email, byName: state.user.name, type: entry.type, keys: entry.keys, ...(entry.values ?? {}) }));
  if (!events.length) return;
  state.events = state.events.concat(events);
  const month = monthOf(events[0]!.at);
  const path = journalPath(month, safeName(state.user.email));
  const mine = state.events.filter((item) => item.by === state.user.email && monthOf(item.at) === month);
  // Read the file again first, so entries written from this person's other computer are kept.
  await state.workspace!.writeText(path, writeJournal(parseJournal(await state.workspace!.readText(path)).concat(mine)));
  rebuild();
}
