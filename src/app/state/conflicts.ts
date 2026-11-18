import { REPORT_TYPES } from '../../core/sources/report-types.ts';
import { mergeTeams, parseTeam, writeTeam } from '../../core/team/team.ts';
import { conflictFolderOf, copiesOf, copyName, tidyJournals, tidyRuns } from '../../core/team/conflict-copies.ts';
import { monthOf, runFolder } from '../../core/memory/memory.ts';
import { isMonth, jsonNames } from './folder-files.ts';
import { state, today } from './store.ts';

/**
 * Conflict copies (version 0.11): OneDrive keeps a copy when two computers change a file before the sync.
 * The copies are tidied when the folder is read, and moved to data/archive/yyyy-mm/conflicts/, never deleted.
 */

/** Moves a conflict copy to data/archive/yyyy-mm/conflicts/ (never deleted). `name` '' : the file was overwritten, nothing to remove. */
async function archiveCopy(folder: string, item: { name: string; to: string; text: string }, month: string): Promise<void> {
  await state.workspace!.writeText(`${conflictFolderOf(month)}/${item.to}`, item.text);
  if (item.name) await state.workspace!.remove(`${folder}/${item.name}`);
}

/**
 * Tidies the conflict copies OneDrive makes when two computers change a file before the sync (see src/core/team/conflict-copies.ts):
 * two loads of the same report, Settings saved on two computers, the team list, and a journal written on two computers.
 * Writes nothing when there is nothing to tidy. Returns what to say on the screen.
 */
export async function tidyFolder(): Promise<string[]> {
  const workspace = state.workspace!;
  const notes: string[] = [];
  for (const kind of REPORT_TYPES.map((type) => type.kind)) {
    const folder = runFolder(kind);
    const names = jsonNames(await workspace.list(folder));
    if (names.length < 2) continue;
    const files = [];
    for (const name of names) files.push({ name, text: await workspace.readText(`${folder}/${name}`) });
    const tidy = tidyRuns(files);
    for (const item of tidy.write) await workspace.writeText(`${folder}/${item.name}`, item.text);
    for (const item of tidy.archive) await archiveCopy(folder, item, monthOf(item.to));
    for (const file of tidy.notes) notes.push(`The report ${file.replace(/\.json$/, '').replace(/^\d{4}-\d{2}-\d{2}_/, '')} was loaded on two computers at the same moment. One load is kept.`);
  }
  for (const month of (await workspace.listFolders('data/journal')).filter(isMonth)) {
    const folder = `data/journal/${month}`;
    const listed = (await workspace.list(folder)).filter((file) => /\.jsonl$/i.test(file.name));
    if (listed.length < 2) continue;
    const files = [];
    for (const file of listed) files.push({ name: file.name, text: await workspace.readText(`${folder}/${file.name}`) });
    const tidy = tidyJournals(files);
    for (const item of tidy.write) await workspace.writeText(`${folder}/${item.name}`, item.text);
    for (const item of tidy.archive) await archiveCopy(folder, item, month);
    if (tidy.notes.length) notes.push('A journal was written on two computers at the same moment. Its entries are kept, each once.');
  }
  const inData = (await workspace.list('data')).map((file) => file.name);
  const month = monthOf(today());
  const settingsCopies = copiesOf(inData, 'settings.json');
  for (const name of settingsCopies) {
    const text = await workspace.readText(`data/${name}`);
    await archiveCopy('data', { name, to: copyName('settings.json', text), text }, month);
  }
  if (settingsCopies.length) notes.push('The team settings were changed on two computers at the same time. Please check Settings.');
  const teamCopies = copiesOf(inData, 'team.json');
  if (teamCopies.length) {
    let members = parseTeam(await workspace.readText('data/team.json'));
    for (const name of teamCopies) members = mergeTeams(members, parseTeam(await workspace.readText(`data/${name}`)));
    await workspace.writeText('data/team.json', writeTeam(members));
    for (const name of teamCopies) {
      const text = await workspace.readText(`data/${name}`);
      await archiveCopy('data', { name, to: copyName('team.json', text), text }, month);
    }
    notes.push('The team list was changed on two computers at the same time. Both lists are joined: please check Settings → Team.');
  }
  return notes;
}
