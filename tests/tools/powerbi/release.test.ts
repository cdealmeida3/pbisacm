import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { zipEntries } from '../../../src/core/reading/xlsx.ts';
import { CARRIED_PARAMETERS, packageVersion, releaseEntries, releaseFolder, trackedPowerBiFiles, updatePlan, zipOf } from '../../../tools/powerbi/release.ts';
import { folderProblems, NATIVE_TYPES, pageProblems, readCatalogue, readPages } from '../../../tools/powerbi/pages.ts';
import { APP_SLOTS, FLOW_SLOTS } from '../../../tools/powerbi/tokens.ts';

/*
 * The zip of a version and its update script (build R1, D339): the zip unpacks into one folder named after the
 * version, and Update-Workbench.ps1 carries the five parameters and the apps from the previous folder, nothing else.
 * The script runs in PowerShell (pwsh): on GitHub's Linux runner it is installed, so CI always runs it; a computer
 * without pwsh skips that part and says so.
 */

const root = join(import.meta.dirname, '..', '..', '..');
const version = packageVersion();
const folder = releaseFolder(version);

/** The files of a zip, read back with the zip reader of src/core. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of zipEntries(zip)) {
    const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    files.set(entry.name, entry.method === 8 ? inflateRawSync(data) : Buffer.from(data));
  }
  return files;
}
function extract(zip: Buffer, into: string): void {
  for (const [name, data] of unzip(zip)) {
    mkdirSync(dirname(join(into, name)), { recursive: true });
    writeFileSync(join(into, name), data);
  }
}
/** Every file under a folder with its bytes, to see that a folder did not change. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(path.slice(dir.length), readFileSync(path, 'base64'));
    }
  };
  walk(dir);
  return out;
}

test('every file of the zip sits in SACM-Workbench-<version>/, never in powerbi/', () => {
  const files = unzip(zipOf(releaseEntries()));
  assert.ok(files.size > 100);
  for (const name of files.keys()) assert.ok(name.startsWith(`${folder}/`), name);
  for (const part of ['SACM-Workbench.pbip', 'Update-Workbench.ps1', 'Update-Workbench.cmd', 'update.json', 'README.md',
    'SACM-Workbench.SemanticModel/definition/expressions.tmdl', 'SACM-Workbench.Report/definition/report.json']) {
    assert.ok(files.has(`${folder}/${part}`), part);
  }
  for (const name of files.keys()) assert.doesNotMatch(name, /\.pbix$|\/\.pbi\//i, name);
});

test('the zip holds exactly the files of powerbi/ that git keeps, byte for byte (a .cmd with Windows line ends), and update.json', () => {
  const files = unzip(zipOf(releaseEntries()));
  const tracked = trackedPowerBiFiles();
  assert.deepEqual([...files.keys()].sort(), [...tracked.map((path) => `${folder}/${path}`), `${folder}/update.json`].sort());
  for (const path of tracked) {
    const original = readFileSync(join(root, 'powerbi', path));
    const packed = files.get(`${folder}/${path}`)!;
    if (path.endsWith('.cmd')) assert.equal(packed.toString('utf8'), original.toString('utf8').replace(/\r?\n/g, '\r\n'), path);
    else assert.ok(packed.equals(original), path);
  }
});

test('the same files give the same zip', () => {
  assert.ok(zipOf(releaseEntries()).equals(zipOf(releaseEntries())));
});

test('update.json names the five parameters, the native types and one place per page from APP_SLOTS and FLOW_SLOTS', () => {
  const plan = updatePlan();
  assert.equal(plan.version, version);
  assert.deepEqual(plan.parameters, ['SourceMode', 'StateMode', 'SharePointSite', 'ReportsFolder', 'ServiceNowAddress']);
  assert.deepEqual(new Set(plan.native), NATIVE_TYPES);
  for (const [page, slot] of Object.entries(APP_SLOTS)) assert.deepEqual(plan.slots[page], { kind: 'app', name: slot.app, x: slot.x, y: slot.y, width: slot.width, height: slot.height });
  for (const [page, slot] of Object.entries(FLOW_SLOTS)) assert.deepEqual(plan.slots[page], { kind: 'flow', name: slot.flow, x: slot.x, y: slot.y, width: slot.width, height: slot.height });
  const model = readFileSync(join(root, 'powerbi', 'SACM-Workbench.SemanticModel', 'definition', 'expressions.tmdl'), 'utf8');
  for (const name of CARRIED_PARAMETERS) assert.match(model, new RegExp(`^expression ${name} = [^\\n]*? meta \\[IsParameterQuery = true`, 'm'), name);
});

test('the update script is plain ASCII (Windows PowerShell 5.1 reads a file without a byte order mark in the code page) and the .cmd calls it', () => {
  const script = readFileSync(join(root, 'powerbi', 'Update-Workbench.ps1'));
  assert.ok([...script].every((byte) => byte < 0x80), 'a character outside ASCII in Update-Workbench.ps1');
  assert.match(readFileSync(join(root, 'powerbi', 'Update-Workbench.cmd'), 'utf8'), /powershell\.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-Workbench\.ps1"/);
});

// ---- The script itself, in PowerShell ---------------------------------------------------------------------------

// pwsh (PowerShell 7) by default; UPDATE_SHELL=powershell runs it in Windows PowerShell 5.1, as on Carlos's laptop (the
// job powerbi-eval of the workflow Power BI does).
const shell = process.env.UPDATE_SHELL ?? 'pwsh';
const probe = spawnSync(shell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
const hasShell = !probe.error && probe.status === 0;
if (!hasShell && process.env.CI) throw new Error(`${shell} is missing on the CI runner: the update script would not be tested`);
const skip = hasShell ? false : `${shell} is not installed here; the CI runs this part`;

const pages = (project: string): string => join(project, 'SACM-Workbench.Report', 'definition', 'pages');
const modelFile = (project: string): string => join(project, 'SACM-Workbench.SemanticModel', 'definition', 'expressions.tmdl');
const invented = { sourceMode: '"SharePoint"', folder: '"Shared Documents/Invented team/Reports"' };

/**
 * An invented visual Carlos added in the service: a type that is not native, at a place near the slot, with the kind of
 * fields a Power Apps visual keeps (an app id, an environment, its fields and filter; all invented, zero GUIDs).
 */
function appVisual(name: string, type: string, position: { x: number; y: number; width: number; height: number }): string {
  const zero = '00000000-0000-0000-0000-000000000000';
  return `${JSON.stringify({
    name,
    position: { ...position, z: 9000, tabOrder: 9000 },
    visual: {
      visualType: type,
      query: { queryState: { Values: { projections: [{ field: { Column: { Expression: { SourceRef: { Entity: 'CaseLines' } }, Property: 'Key' } }, queryRef: 'CaseLines.Key' }] } } },
      objects: { general: [{ properties: { appId: { expr: { Literal: { Value: `'${zero}'` } } }, environmentId: { expr: { Literal: { Value: `'${zero}'` } } } } }] }
    },
    filterConfig: { filters: [{ name: 'forTheApp', field: { Measure: { Expression: { SourceRef: { Entity: 'CaseLines' } }, Property: 'For the app' } }, type: 'Advanced' }] }
  }, null, 2)}\n`;
}

/**
 * The previous folder as Carlos has it: the files of an old version (here the files of this one), Desktop's line ends
 * in expressions.tmdl with his own parameter values, an old panel of B2 left behind (the table `ci` of the Case page at
 * 24,64), his Power App on Case at a place a little off, the button Refresh now on My day, an app on a page that keeps
 * no place for one, and the app's type in report.json.
 */
function previousFolder(at: string): void {
  extract(zipOf(releaseEntries()), at);
  const unpacked = join(at, folder);
  const old = join(at, 'powerbi');
  cpSync(unpacked, old, { recursive: true });
  rmSync(unpacked, { recursive: true });
  rmSync(join(old, 'update.json'));
  const model = readFileSync(modelFile(old), 'utf8')
    .replace(/^(expression SourceMode = )"Sample"/m, `$1${invented.sourceMode}`)
    .replace(/^(expression ReportsFolder = )"[^"]*"/m, `$1${invented.folder}`)
    .replace(/\r?\n/g, '\r\n');
  writeFileSync(modelFile(old), model);
  const visual = (page: string, name: string, text: string): void => {
    mkdirSync(join(pages(old), page, 'visuals', name), { recursive: true });
    writeFileSync(join(pages(old), page, 'visuals', name, 'visual.json'), text);
  };
  visual('case', 'ci', `${JSON.stringify({ name: 'ci', position: { x: 24, y: 64, z: 0, width: 1232, height: 100 }, visual: { visualType: 'tableEx' } }, null, 2)}\n`);
  visual('case', 'a1b2c3d4e5f6a7b8c9d0', appVisual('a1b2c3d4e5f6a7b8c9d0', 'PowerApps_PBI_CV_INVENTED', { x: 955.5, y: 80, width: 301.25, height: 600 }));
  visual('myday', 'f0e1d2c3b4a596877869', appVisual('f0e1d2c3b4a596877869', 'InventedAutomateVisual', { x: 16, y: 600, width: 160, height: 40 }));
  visual('overview', 'aaaabbbbccccddddeeee', appVisual('aaaabbbbccccddddeeee', 'PowerApps_PBI_CV_INVENTED', { x: 956, y: 84, width: 300, height: 300 }));
  const report = JSON.parse(readFileSync(join(old, 'SACM-Workbench.Report', 'definition', 'report.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(old, 'SACM-Workbench.Report', 'definition', 'report.json'), JSON.stringify({ ...report, publicCustomVisuals: ['PowerApps_PBI_CV_INVENTED', 'InventedAutomateVisual'] }, null, 2));
}
function newFolder(at: string): string {
  extract(zipOf(releaseEntries()), at);
  return join(at, folder);
}
const update = (project: string, ...args: string[]) =>
  spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(project, 'Update-Workbench.ps1'), '-Yes', ...args], { encoding: 'utf8' });

test('the update script carries the parameters and the apps of the previous folder, at the places of this version, and nothing else', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const old = join(at, 'powerbi');
    const before = snapshot(old);
    const project = newFolder(at);
    const run = update(project);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    // The parameters: the two he changed, the others as they are.
    const model = readFileSync(modelFile(project), 'utf8');
    assert.match(model, new RegExp(`^expression SourceMode = ${invented.sourceMode} meta \\[`, 'm'));
    assert.match(model, new RegExp(`^expression ReportsFolder = ${invented.folder} meta \\[`, 'm'));
    assert.match(model, /^expression StateMode = "Sample" meta \[/m);
    const shipped = readFileSync(join(root, 'powerbi', 'SACM-Workbench.SemanticModel', 'definition', 'expressions.tmdl'), 'utf8');
    assert.equal(model.includes('\r\n'), shipped.includes('\r\n'), 'only the values change, not the line ends of the new file');
    assert.equal(model.replace(/^(expression SourceMode = )[^\n]*?( meta \[)/m, '$1"Sample"$2').replace(/^(expression ReportsFolder = )[^\n]*?( meta \[)/m, '$1"Shared Documents/Workbench/Reports"$2'),
      shipped, 'nothing else of the model changes');
    // The apps: on Case and My day, at the places of this version; not on Overview; no old panel.
    const placed = (page: string, name: string) => JSON.parse(readFileSync(join(pages(project), page, 'visuals', name, 'visual.json'), 'utf8')) as { position: Record<string, number>; visual: { visualType: string } };
    const app = placed('case', 'a1b2c3d4e5f6a7b8c9d0');
    assert.deepEqual([app.position.x, app.position.y, app.position.width, app.position.height], [APP_SLOTS.case!.x, APP_SLOTS.case!.y, APP_SLOTS.case!.width, APP_SLOTS.case!.height]);
    assert.equal(app.position.z, 9000);
    assert.equal(app.visual.visualType, 'PowerApps_PBI_CV_INVENTED');
    // Only the place changes: the app id, the environment, the fields and the filter come over as they were.
    const original = JSON.parse(readFileSync(join(old, 'SACM-Workbench.Report', 'definition', 'pages', 'case', 'visuals', 'a1b2c3d4e5f6a7b8c9d0', 'visual.json'), 'utf8')) as Record<string, unknown>;
    assert.deepEqual({ ...app, position: undefined }, { ...original, position: undefined });
    const flow = placed('myday', 'f0e1d2c3b4a596877869');
    assert.deepEqual([flow.position.x, flow.position.y, flow.position.width, flow.position.height], [FLOW_SLOTS.myday!.x, FLOW_SLOTS.myday!.y, FLOW_SLOTS.myday!.width, FLOW_SLOTS.myday!.height]);
    assert.ok(!existsSync(join(pages(project), 'overview', 'visuals', 'aaaabbbbccccddddeeee')), 'an app on a page with no place is not copied');
    assert.ok(!existsSync(join(pages(project), 'case', 'visuals', 'ci')), 'an old panel is not copied');
    assert.match(run.stdout, /Overview : the visual aaaabbbbccccddddeeee .*not copied/);
    const report = JSON.parse(readFileSync(join(project, 'SACM-Workbench.Report', 'definition', 'report.json'), 'utf8')) as { publicCustomVisuals?: string[] };
    assert.deepEqual(report.publicCustomVisuals, ['PowerApps_PBI_CV_INVENTED', 'InventedAutomateVisual']);
    // The new folder keeps every rule of the pages, with the apps on their places.
    const definition = join(project, 'SACM-Workbench.Report', 'definition');
    assert.deepEqual(folderProblems(definition), []);
    assert.deepEqual(pageProblems(readPages(definition), readCatalogue()), []);
    // The old folder is unchanged; a second run changes nothing.
    assert.deepEqual(snapshot(old), before);
    const once = snapshot(project);
    const again = update(project);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.deepEqual(snapshot(project), once);
    assert.match(again.stdout, /is already here/);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('the update script takes the newest older SACM-Workbench-<version> folder beside it, never a newer one', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const older = join(at, 'SACM-Workbench-0.1.0');
    cpSync(join(at, 'powerbi'), older, { recursive: true });
    writeFileSync(modelFile(older), readFileSync(modelFile(older), 'utf8').replace(invented.sourceMode, '"Sample"'));
    const newer = join(at, 'SACM-Workbench-999.0.0');
    cpSync(join(at, 'powerbi'), newer, { recursive: true });
    writeFileSync(modelFile(newer), readFileSync(modelFile(newer), 'utf8').replace(invented.folder, '"Shared Documents/Newer"'));
    const middle = join(at, 'SACM-Workbench-0.2.0');
    cpSync(join(at, 'powerbi'), middle, { recursive: true });
    rmSync(join(at, 'powerbi'), { recursive: true });
    const project = newFolder(at);
    const run = update(project);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Previous folder: .*SACM-Workbench-0\.2\.0/);
    assert.match(readFileSync(modelFile(project), 'utf8'), new RegExp(`^expression ReportsFolder = ${invented.folder} meta`, 'm'));
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('the update script refuses, and changes nothing, when this version lacks a parameter or no previous folder is found', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    const alone = newFolder(join(at, 'alone'));
    const before = snapshot(alone);
    const none = update(alone);
    assert.equal(none.status, 1);
    assert.match(none.stdout, /Nothing was changed\. No previous folder found/);
    assert.deepEqual(snapshot(alone), before);

    previousFolder(join(at, 'pair'));
    const project = newFolder(join(at, 'pair'));
    writeFileSync(modelFile(project), readFileSync(modelFile(project), 'utf8').replace(/^expression StateMode = [^\n]*\n/m, ''));
    const untouched = snapshot(project);
    const run = update(project);
    assert.equal(run.status, 1);
    assert.match(run.stdout, /Nothing was changed\. The new version has no parameter StateMode/);
    assert.deepEqual(snapshot(project), untouched);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('the update script looks one folder higher when Windows unzipped into a folder named after the zip', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const project = newFolder(join(at, `SACM-Workbench-PowerBI-R1-${version}`));
    const run = update(project);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Previous folder: .*powerbi/);
    assert.match(readFileSync(modelFile(project), 'utf8'), new RegExp(`^expression SourceMode = ${invented.sourceMode} meta`, 'm'));
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

// ---- A report downloaded from the service (.pbix, build L1, D376) ----------------------------------------------

/** A word that is only in the data model of the invented .pbix: the script must never read it or name it. */
const MODEL_WORD = 'INVENTED_MODEL_PART_NEVER_READ';

/**
 * An invented .pbix as the service gives it (a zip in the PBIR format): the button Refresh now on My day and Reports at
 * Carlos's place before build L1 (a little off), with its text in white, a Power App on Case, an app on Overview (no
 * place there), the app's type in report.json, and a data model that is not JSON (it fails when parsed).
 */
function pbixVisual(name: string, type: string, position: { x: number; y: number; width: number; height: number }): string {
  const visual = JSON.parse(appVisual(name, type, position)) as { visual: { objects: Record<string, unknown> } };
  visual.visual.objects.buttonText = [{ properties: { text: { expr: { Literal: { Value: "'Refresh now'" } } }, fontColor: { solid: { color: { expr: { ThemeDataColor: { ColorId: 0, Percent: 0 } } } } } } }];
  return `${JSON.stringify(visual, null, 2)}\n`;
}
function pbixFile(path: string, format: 'pbir' | 'layout' = 'pbir'): void {
  const text = (value: string): Uint8Array => Buffer.from(value, 'utf8');
  const entries: Array<{ path: string; data: Uint8Array }> = [
    { path: 'Version', data: text('1.28') },
    { path: 'DataModel', data: text(`{ not json ${MODEL_WORD}`) }
  ];
  if (format === 'layout') {
    entries.push({ path: 'Report/Layout', data: text('{}') });
  } else {
    const page = (key: string, display: string) => ({ path: `Report/definition/pages/${key}/page.json`, data: text(JSON.stringify({ name: key, displayName: display, width: 1280, height: 720 })) });
    const visual = (key: string, name: string, json: string) => ({ path: `Report/definition/pages/${key}/visuals/${name}/visual.json`, data: text(json) });
    entries.push(
      { path: 'Report/definition/report.json', data: text(JSON.stringify({ publicCustomVisuals: ['PowerApps_PBI_CV_INVENTED'] })) },
      page('myday', 'My day'), page('reports', 'Reports'), page('case', 'Case'), page('overview', 'Overview'), page('people', 'People'),
      visual('myday', '0000000000000000aaaa', pbixVisual('0000000000000000aaaa', 'InventedAutomateVisual', { x: 16, y: 590, width: 156, height: 60 })),
      visual('reports', '0000000000000000bbbb', pbixVisual('0000000000000000bbbb', 'InventedAutomateVisual', { x: 16, y: 590, width: 156, height: 60 })),
      visual('case', '0000000000000000cccc', appVisual('0000000000000000cccc', 'PowerApps_PBI_CV_INVENTED', { x: 950, y: 90, width: 300, height: 600 })),
      visual('overview', '0000000000000000dddd', appVisual('0000000000000000dddd', 'PowerApps_PBI_CV_INVENTED', { x: 956, y: 84, width: 300, height: 300 })),
      visual('people', 'peopleTable', `${JSON.stringify({ name: 'peopleTable', position: { x: 204, y: 84, z: 0, width: 600, height: 400 }, visual: { visualType: 'tableEx' } }, null, 2)}\n`)
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, zipOf(entries));
}
type Placed = { position: Record<string, number>; visual: { visualType: string; objects: Record<string, unknown> } };
const placedIn = (project: string, page: string, name: string): Placed => JSON.parse(readFileSync(join(pages(project), page, 'visuals', name, 'visual.json'), 'utf8')) as Placed;
const slotOf = (slot: { x: number; y: number; width: number; height: number }): number[] => [slot.x, slot.y, slot.width, slot.height];
const placeOf = (visual: Placed): number[] => [visual.position.x!, visual.position.y!, visual.position.width!, visual.position.height!];

test('the update script takes the apps and buttons from a downloaded .pbix beside it, each to its place, text and colour kept', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const report = join(at, 'SACM-Workbench.pbix');
    pbixFile(report);
    const before = readFileSync(report);
    const project = newFolder(at);
    const run = update(project);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Report file: +.*SACM-Workbench\.pbix/);
    // The parameters still come from the previous folder.
    assert.match(readFileSync(modelFile(project), 'utf8'), new RegExp(`^expression ReportsFolder = ${invented.folder} meta \\[`, 'm'));
    // The buttons of the .pbix on My day and Reports, at the place of this version; only the place changes.
    for (const [page, name] of [['myday', '0000000000000000aaaa'], ['reports', '0000000000000000bbbb']] as const) {
      const button = placedIn(project, page, name);
      assert.deepEqual(placeOf(button), slotOf(FLOW_SLOTS[page]!), page);
      assert.deepEqual({ ...button, position: undefined }, { ...(JSON.parse(pbixVisual(name, 'InventedAutomateVisual', { x: 0, y: 0, width: 0, height: 0 })) as object), position: undefined }, page);
      assert.deepEqual(button.visual.objects.buttonText, [{ properties: { text: { expr: { Literal: { Value: "'Refresh now'" } } }, fontColor: { solid: { color: { expr: { ThemeDataColor: { ColorId: 0, Percent: 0 } } } } } } }]);
    }
    // The .pbix wins on the pages where it has an app: the folder's button of My day and its app of Case stay behind.
    assert.ok(!existsSync(join(pages(project), 'myday', 'visuals', 'f0e1d2c3b4a596877869')), 'the folder\'s button is replaced by the one of the .pbix');
    assert.ok(!existsSync(join(pages(project), 'case', 'visuals', 'a1b2c3d4e5f6a7b8c9d0')), 'the folder\'s app is replaced by the one of the .pbix');
    assert.deepEqual(placeOf(placedIn(project, 'case', '0000000000000000cccc')), slotOf(APP_SLOTS.case!));
    // No place on Overview; a native visual of the .pbix is never copied.
    assert.ok(!existsSync(join(pages(project), 'overview', 'visuals', '0000000000000000dddd')));
    assert.match(run.stdout, /Overview : the visual 0000000000000000dddd .*not copied/);
    assert.ok(!existsSync(join(pages(project), 'people', 'visuals', 'peopleTable')));
    const types = JSON.parse(readFileSync(join(project, 'SACM-Workbench.Report', 'definition', 'report.json'), 'utf8')) as { publicCustomVisuals?: string[] };
    // The types of the .pbix's report.json and of the previous folder's, for the visuals copied.
    assert.deepEqual(types.publicCustomVisuals, ['PowerApps_PBI_CV_INVENTED', 'InventedAutomateVisual']);
    // The new folder keeps every rule of the pages; the .pbix is unchanged and nothing is written next to it.
    const definition = join(project, 'SACM-Workbench.Report', 'definition');
    assert.deepEqual(folderProblems(definition), []);
    assert.deepEqual(pageProblems(readPages(definition), readCatalogue()), []);
    assert.ok(readFileSync(report).equals(before));
    assert.deepEqual(readdirSync(at).sort(), ['SACM-Workbench.pbix', folder, 'powerbi'].sort());
    // A second run changes nothing.
    const once = snapshot(project);
    const again = update(project);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.deepEqual(snapshot(project), once);
    assert.match(again.stdout, /is already here/);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('the update script never reads the data model of the .pbix', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const report = join(at, 'elsewhere', 'Downloaded.pbix');
    pbixFile(report);
    const project = newFolder(at);
    const run = update(project, '-Report', report);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.doesNotMatch(run.stdout + run.stderr, new RegExp(`${MODEL_WORD}|DataModel`));
    for (const [path, data] of snapshot(project)) assert.ok(!Buffer.from(data, 'base64').toString('utf8').includes(MODEL_WORD), path);
    assert.deepEqual(placeOf(placedIn(project, 'myday', '0000000000000000aaaa')), slotOf(FLOW_SLOTS.myday!));
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('a .pbix in the old format (Report/Layout) says so, and the update carries the apps of the previous folder only', { skip }, () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-update-'));
  try {
    previousFolder(at);
    const report = join(at, 'Old.pbix');
    pbixFile(report, 'layout');
    const project = newFolder(at);
    const run = update(project, '-Report', report);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Old\.pbix is in the old format .*step 13 of README section 6\.4/);
    assert.deepEqual(placeOf(placedIn(project, 'case', 'a1b2c3d4e5f6a7b8c9d0')), slotOf(APP_SLOTS.case!));
    assert.deepEqual(placeOf(placedIn(project, 'myday', 'f0e1d2c3b4a596877869')), slotOf(FLOW_SLOTS.myday!));
    const missing = update(project, '-Report', join(at, 'none.pbix'));
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /Nothing was changed\. The file .*none\.pbix does not exist/);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});
