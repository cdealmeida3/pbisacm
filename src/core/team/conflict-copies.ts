import { runFileName, safeName } from '../memory/finder.ts';
import { parseJournal, writeJournal } from '../memory/memory.ts';
import type { CaseEvent } from '../cases/cases.ts';

/**
 * Conflict copies. When two computers change the same file before OneDrive has synced, OneDrive
 * keeps both: the second gets the computer name in its file name (`settings-PC01.json`). The app tidies them when it reads
 * the folder. Pure: the app lists and moves the files, this decides.
 *
 * Every rule gives the same result on every computer: two computers will tidy at the same moment, so each must write
 * the same bytes from the same files (fixed order, no "now", no "by me" in a file), or the tidy itself makes a new copy.
 * Nothing is deleted: a copy moves to `data/archive/yyyy-mm/conflicts/`, under a name made from its content
 * (`settings.1a2b3c4d.json`), so two computers that move the same copy write the same file.
 */

/** A short fingerprint of a text (FNV-1a, 32 bits, hex). */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The archive name of a copy of `canonical`: `2026-11-12_cmdb_ci.csv.json` → `2026-11-12_cmdb_ci.csv.1a2b3c4d.json`. */
export function copyName(canonical: string, text: string): string {
  const dot = canonical.lastIndexOf('.');
  return dot > 0 ? `${canonical.slice(0, dot)}.${contentHash(text)}${canonical.slice(dot)}` : `${canonical}.${contentHash(text)}`;
}

/** The folder where conflict copies go (`data/archive/2026-11/conflicts`). */
export const conflictFolderOf = (month: string): string => `data/archive/${month}/conflicts`;

const stemOf = (name: string): string => name.replace(/\.[^.]+$/, '');
/** Is `name` a copy of `canonical` (same stem plus something, the way OneDrive and SharePoint name copies)? */
export const isCopyOf = (name: string, canonical: string): boolean =>
  name !== canonical && name.toLowerCase().startsWith(stemOf(canonical).toLowerCase()) && /^[-_ (]/.test(name.slice(stemOf(canonical).length)) && /\.[^.]+$/.test(name)
  && name.slice(name.lastIndexOf('.')).toLowerCase() === canonical.slice(canonical.lastIndexOf('.')).toLowerCase();

export interface RunFile { name: string; text: string }
interface RunLike { date?: string; report?: string; loadedAt?: string }

/**
 * What to do with the files of one folder. `write`: put this text in this file. `archive`: keep this text in the conflict
 * folder under `to`, then remove the file `name` ('' when nothing is removed: the file is overwritten by a `write`).
 * `notes`: the names that were tidied, for the message on the screen.
 */
export interface Tidy { write: Array<{ name: string; text: string }>; archive: Array<{ name: string; to: string; text: string }>; notes: string[] }

/**
 * Two run files for the same report (date and name) are one load: OneDrive made a copy when two managers loaded the same
 * new report before the sync. The one loaded first stays (by `loadedAt` when the run has it; runs written from version
 * 0.11 on have none and are the same bytes on every computer); the others move to the archive.
 */
export function tidyRuns(files: RunFile[]): Tidy {
  const groups = new Map<string, Array<RunFile & { run: RunLike }>>();
  for (const file of files) {
    let run: RunLike | null = null;
    try { run = JSON.parse(file.text) as RunLike; } catch { run = null; }
    if (!run || typeof run.date !== 'string' || typeof run.report !== 'string') continue;
    const canonical = runFileName(run.date, run.report);
    // Only a file whose name says it is a copy, or the file itself: a run saved under another name is left alone.
    if (file.name !== canonical && !isCopyOf(file.name, canonical)) continue;
    groups.set(canonical, (groups.get(canonical) ?? []).concat([{ ...file, run }]));
  }
  const tidy: Tidy = { write: [], archive: [], notes: [] };
  Array.from(groups.keys()).sort().forEach((canonical) => {
    const list = groups.get(canonical)!;
    if (list.length === 1 && list[0]!.name === canonical) return;
    const ordered = list.slice().sort((a, b) => (a.run.loadedAt ?? '').localeCompare(b.run.loadedAt ?? '')
      || Number(b.name === canonical) - Number(a.name === canonical) || a.name.localeCompare(b.name));
    const keep = ordered[0]!;
    const current = list.filter((file) => file.name === canonical)[0];
    if (!current || current.text !== keep.text) tidy.write.push({ name: canonical, text: keep.text });
    for (const file of list.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      if (file.name === canonical) { if (file.text !== keep.text) tidy.archive.push({ name: '', to: copyName(canonical, file.text), text: file.text }); continue; }
      tidy.archive.push({ name: file.name, to: copyName(canonical, file.text), text: file.text });
    }
    tidy.notes.push(canonical);
  });
  return tidy;
}

/**
 * The journal files of one month. Each event belongs in the file of the person who did it (`<person>.jsonl`). A file that
 * holds nobody's own events is a copy (one manager on two computers): its events are added to the right files, without
 * doubles, and the copy moves to the archive.
 */
export function tidyJournals(files: RunFile[]): Tidy {
  const tidy: Tidy = { write: [], archive: [], notes: [] };
  const names = new Set(files.map((file) => file.name));
  const owned = new Map<string, CaseEvent[]>();
  const copies: Array<RunFile & { events: CaseEvent[] }> = [];
  for (const file of files.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/\.jsonl$/i.test(file.name)) continue;
    const events = parseJournal(file.text);
    const owners = new Set(events.map((event) => `${safeName(event.by)}.jsonl`).filter((name) => name !== '.jsonl'));
    if (!events.length || owners.has(file.name)) continue;
    // The file of a person who did nothing in it: a copy only when its name says so.
    const target = Array.from(owners).filter((name) => isCopyOf(file.name, name))[0];
    if (!target) continue;
    copies.push({ ...file, events });
    for (const event of events) {
      const name = `${safeName(event.by)}.jsonl`;
      if (name !== '.jsonl') owned.set(name, (owned.get(name) ?? []).concat([event]));
    }
  }
  if (!copies.length) return tidy;
  const byName = new Map(files.map((file) => [file.name, file.text]));
  Array.from(owned.keys()).sort().forEach((name) => {
    const before = names.has(name) ? byName.get(name)! : '';
    const text = writeJournal(parseJournal(before).concat(owned.get(name)!));
    if (text !== before) tidy.write.push({ name, text });
  });
  for (const copy of copies) {
    const owner = Array.from(new Set(copy.events.map((event) => `${safeName(event.by)}.jsonl`)))[0]!;
    tidy.archive.push({ name: copy.name, to: copyName(owner, copy.text), text: copy.text });
    tidy.notes.push(copy.name);
  }
  return tidy;
}

/** The conflict copies of one shared file in a folder (`settings-PC01.json` next to `settings.json`), A to Z. */
export const copiesOf = (names: string[], canonical: string): string[] => names.filter((name) => isCopyOf(name, canonical)).sort();
