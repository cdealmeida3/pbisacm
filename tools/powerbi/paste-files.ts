// The plain paste files (build A1, D383): the six text files Carlos opens in Notepad and pastes into Power Apps Studio,
// one Formulas and one Screen file per app, byte for byte the files of powerbi/apps/:
//   node tools/powerbi/paste-files.ts <folder outside the repository>
// writes SACM-actions-Formulas.txt (= apps/sacm-actions/App-Formulas.fx), SACM-actions-Screen.txt
// (= apps/sacm-actions/Src/ActionsScreen.pa.yaml), and the same for messages and audit. The build thread runs it after a
// merge into the project files (powerapps/), so the files Carlos pastes are always the ones of the repository.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { APP_FOLDER, AUDIT_FOLDER, MESSAGES_FOLDER } from './actions.ts';

const root = join(import.meta.dirname, '..', '..');

/** Each paste file: its name and the file of the repository it copies. */
export const PASTE_FILES: Array<{ name: string; source: string }> = [
  { name: 'SACM-actions-Formulas.txt', source: join(APP_FOLDER, 'App-Formulas.fx') },
  { name: 'SACM-actions-Screen.txt', source: join(APP_FOLDER, 'Src', 'ActionsScreen.pa.yaml') },
  { name: 'SACM-messages-Formulas.txt', source: join(MESSAGES_FOLDER, 'App-Formulas.fx') },
  { name: 'SACM-messages-Screen.txt', source: join(MESSAGES_FOLDER, 'Src', 'MessagesScreen.pa.yaml') },
  { name: 'SACM-audit-Formulas.txt', source: join(AUDIT_FOLDER, 'App-Formulas.fx') },
  { name: 'SACM-audit-Screen.txt', source: join(AUDIT_FOLDER, 'Src', 'AuditScreen.pa.yaml') }
];

/** The paste files with their bytes. */
export function pasteFiles(): Array<{ name: string; data: Buffer }> {
  return PASTE_FILES.map(({ name, source }) => ({ name, data: readFileSync(source) }));
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node tools/powerbi/paste-files.ts <folder outside the repository>');
    process.exit(2);
  }
  const folder = resolve(target);
  const inside = relative(root, folder);
  if (!inside.startsWith('..') && !isAbsolute(inside)) {
    console.error('paste-files: write the paste files outside the repository (the project files); the repository keeps powerbi/apps/.');
    process.exit(2);
  }
  mkdirSync(folder, { recursive: true });
  for (const { name, data } of pasteFiles()) writeFileSync(join(folder, name), data);
  console.log(`${folder}: ${PASTE_FILES.map(({ name }) => name).join(', ')}`);
}
