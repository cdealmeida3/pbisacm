// The zip of a version of the Power BI report (build R1, D339), for Carlos:
//   node tools/powerbi/release.ts <folder or file.zip> [--label R1]
// writes SACM-Workbench-PowerBI-<label>-<version>.zip (or the file named). Every file of the zip sits in one folder named
// after the version, SACM-Workbench-<version>/, never in powerbi/: unzipping a new version next to the old one never
// mixes the two (an unzip adds and replaces files, it never deletes the panels a later build took away, plan §1 S1).
// The zip holds the files of powerbi/ that git keeps (never a .pbix or a cache of Desktop), the script
// Update-Workbench.ps1 with its .cmd, and update.json: what the script carries from the previous folder (the five
// parameters, the places of the Power Apps and of Refresh now, the native visual types). The same input gives the same
// bytes: a fixed time on every entry, the files in name order.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { NATIVE_TYPES } from './pages.ts';
import { APP_SLOTS, FLOW_SLOTS } from './tokens.ts';

const root = join(import.meta.dirname, '..', '..');

/** The parameters that are Carlos's own (typed in Desktop or in the workspace): the script carries their values. */
export const CARRIED_PARAMETERS = ['SourceMode', 'StateMode', 'SharePointSite', 'ReportsFolder', 'ServiceNowAddress'] as const;

/** The folder every file of the zip sits in. */
export const releaseFolder = (version: string): string => `SACM-Workbench-${version}`;

export const packageVersion = (): string => (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

/** One place of a visual Carlos adds by hand in the service: a Power App (APP_SLOTS) or the button Refresh now (FLOW_SLOTS). */
export interface Slot { kind: 'app' | 'flow'; name: string; x: number; y: number; width: number; height: number }

/** What Update-Workbench.ps1 reads: the version, the parameters to carry, the native types and the place of the app of each page. */
export function updatePlan(version = packageVersion()): { version: string; parameters: string[]; native: string[]; slots: Record<string, Slot> } {
  const slots: Record<string, Slot> = {};
  for (const [page, slot] of Object.entries(APP_SLOTS)) slots[page] = { kind: 'app', name: slot.app, x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  for (const [page, slot] of Object.entries(FLOW_SLOTS)) {
    // The script finds the place of a copied visual by its page: a page has one place at most.
    if (slots[page]) throw new Error(`The page ${page} has the place of a Power App and of Refresh now; Update-Workbench.ps1 knows one place per page`);
    slots[page] = { kind: 'flow', name: slot.flow, x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  }
  const sorted = Object.fromEntries(Object.entries(slots).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { version, parameters: [...CARRIED_PARAMETERS], native: [...NATIVE_TYPES].sort(), slots: sorted };
}

/** The files of powerbi/ that git keeps, relative to powerbi/, in name order. */
export function trackedPowerBiFiles(): string[] {
  const run = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', 'powerbi'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ls-files failed: ${run.stderr.trim()}`);
  return run.stdout.split('\0').filter(Boolean).map((path) => path.slice('powerbi/'.length))
    .filter((path) => { try { return statSync(join(root, 'powerbi', path)).isFile(); } catch { return false; } })
    .sort();
}

/** The entries of the zip: the path inside it and the bytes. A .cmd gets Windows line ends (cmd.exe misreads a batch file without them). */
export function releaseEntries(version = packageVersion(), files = trackedPowerBiFiles()): Array<{ path: string; data: Uint8Array }> {
  const folder = releaseFolder(version);
  const entries = files.map((path) => {
    let data: Uint8Array = readFileSync(join(root, 'powerbi', path));
    if (path.toLowerCase().endsWith('.cmd')) data = Buffer.from(Buffer.from(data).toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
    return { path: `${folder}/${path}`, data };
  });
  entries.push({ path: `${folder}/update.json`, data: Buffer.from(`${JSON.stringify(updatePlan(version), null, 2)}\n`, 'utf8') });
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// 1 January 2026, 00:00, as an MS-DOS time and date: every entry gets it, so the same files give the same zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A zip of the entries (deflate, names in UTF-8), with `comment` (the commit) at its end. */
export function zipOf(entries: Array<{ path: string; data: Uint8Array }>, comment = ''): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { path, data } of entries) {
    const name = Buffer.from(path, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // the name is UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by: MS-DOS, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const note = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(note.length, 20);
  return Buffer.concat([...locals, directory, end, note]);
}

/** The commit the zip is made from, with "+ changes" when powerbi/ has changes git does not hold yet. */
function commitNote(): string {
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const changed = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', 'powerbi'], { encoding: 'utf8' }).stdout.trim();
  return changed ? `${head} + changes` : head;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const labelAt = args.indexOf('--label');
  const label = labelAt >= 0 ? args[labelAt + 1] : undefined;
  const target = args.find((arg, index) => !arg.startsWith('--') && index !== labelAt + 1);
  if (!target) {
    console.error('Usage: node tools/powerbi/release.ts <folder or file.zip> [--label R1]');
    process.exit(2);
  }
  const version = packageVersion();
  const file = target.toLowerCase().endsWith('.zip') ? target : join(target, `SACM-Workbench-PowerBI-${label ? `${label}-` : ''}${version}.zip`);
  const entries = releaseEntries(version);
  writeFileSync(file, zipOf(entries, commitNote()));
  console.log(`${file}: ${entries.length} files in ${releaseFolder(version)}/`);
}
