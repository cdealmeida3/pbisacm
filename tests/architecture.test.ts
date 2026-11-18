import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, posix } from 'node:path';

/*
 * The design rules of the code (docs/ARCHITECTURE.md), checked on the source files:
 *   1. The logic (src/core) never uses the screens, the browser or Node.
 *   2. The centre of the logic does not know the features.
 *   3. What the screens show (src/app/view/) is pure, like the logic.
 *   4. A screen does not import another screen.
 * Rules 2 and 4 have no exception left (since pieces A5 and A7). For rule 2 a new exception fails the test, and so does an
 * exception that has gone but is still listed, so the list can only stay empty.
 */

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const filesOf = (folder: string, pattern: RegExp): string[] =>
  readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' }).filter((file) => pattern.test(file)).map((file) => `${folder}/${file.replace(/\\/g, '/')}`).sort();

/** Every module a file imports (also `import type` and `export … from`). */
function importsOf(path: string): string[] {
  const out: string[] = [];
  const binding = String.raw`(?:type\s+)?(?:[\w$*]+(?:\s+as\s+[\w$]+)?\s*,?\s*)?(?:\{[^}]*\})?`;
  for (const match of read(path).matchAll(new RegExp(String.raw`^\s*(?:import|export)\s+${binding}\s*from\s+['"]([^'"]+)['"]`, 'gm'))) out.push(match[1]!);
  for (const match of read(path).matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(match[1]!);
  for (const match of read(path).matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(match[1]!);
  return out;
}

/** The code without comments and string contents, so a word in a comment or a message text is not taken for code. */
function codeOf(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
}

const name = (path: string): string => basename(path).replace(/\.tsx?$/, '');

const CORE = filesOf('src/core', /\.ts$/);

test('rule 1: the logic imports only the logic (no screen, no library, no Node)', () => {
  assert.ok(CORE.length > 20);
  for (const file of CORE) {
    for (const target of importsOf(file)) {
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      assert.ok(target.startsWith('.') && resolved.startsWith('src/core/') && resolved.endsWith('.ts'), `${file} imports ${target}: the logic may import only files of src/core`);
    }
  }
});

test('rule 1: the logic uses no browser or Node object', () => {
  const forbidden = /\b(window|document|localStorage|sessionStorage|indexedDB|navigator|location|process|require|fetch|XMLHttpRequest|Buffer|__dirname|globalThis|atob|btoa)\b(?!\s*:)/;
  for (const file of CORE) {
    const code = codeOf(file);
    const found = code.split('\n').find((line) => forbidden.test(line));
    assert.equal(found, undefined, `${file} uses a browser or Node object: ${found?.trim()}`);
  }
});

/** The centre of the logic: the types, the shared helpers, the check engine and the finding states, and the cases. */
const CENTRE = [
  'src/core/model/model.ts', 'src/core/shared/dates.ts', 'src/core/shared/names.ts', 'src/core/shared/text.ts', 'src/core/reading/csv.ts',
  'src/core/checks/engine.ts', 'src/core/checks/finding-states.ts', 'src/core/cases/cases.ts', 'src/core/cases/contact.ts', 'src/core/cases/replies.ts',
  'src/core/cases/inventory.ts'
];
/** The features and the readers of one report type, by folder (or file). The centre must not import them. */
const FEATURES = [
  'src/core/sources/ci', 'src/core/sources/relationships', 'src/core/sources/epo', 'src/core/sources/contracts',
  'src/core/team', 'src/core/audit', 'src/core/memory', 'src/core/messages', 'src/core/reading/xlsx.ts', 'src/core/sources/report-types.ts'
];
/** Exceptions to rule 2. Empty since piece A5 ("one way to plug in"); it may never grow again. */
const CENTRE_EXCEPTIONS: string[] = [];
/** The plug-in list of the checks: the one place the centre may reach the detectors, and through them the report types. */
const DETECTOR_LIST = 'src/core/checks/detectors/index.ts';

test('rule 2: the centre of the logic does not import the features (except the listed ones of today)', () => {
  const found: string[] = [];
  for (const file of CENTRE) {
    for (const target of importsOf(file)) {
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      const feature = FEATURES.find((part) => resolved === part || resolved.startsWith(`${part}/`));
      if (feature) found.push(`${name(file)} -> ${feature.replace('src/core/', '')}`);
    }
  }
  const unique = [...new Set(found)].sort();
  assert.deepEqual(unique.filter((edge) => !CENTRE_EXCEPTIONS.includes(edge)), [], 'A centre module now imports a feature. Plug the feature in instead (see docs/ARCHITECTURE.md).');
  assert.deepEqual(CENTRE_EXCEPTIONS.filter((edge) => !unique.includes(edge)), [], 'An exception has gone: remove it from CENTRE_EXCEPTIONS.');
  for (const part of CENTRE.concat(FEATURES)) assert.ok(CORE.some((path) => path === part || path.startsWith(`${part}/`)), `${part} is listed but does not exist`);
});

test('rule 2: the centre reaches the detectors only through their one list', () => {
  for (const file of CENTRE) {
    for (const target of importsOf(file)) {
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      if (resolved.startsWith('src/core/checks/detectors/')) assert.equal(resolved, DETECTOR_LIST, `${file} imports ${target}: add the detector to ${DETECTOR_LIST} instead`);
    }
  }
});

/** What the screens show (src/app/view/) and the actions (src/app/state/), by area. */
const VIEW = filesOf('src/app/view', /\.ts$/);
const STATE = filesOf('src/app/state', /\.ts$/);
const resolvedImports = (file: string): string[] => importsOf(file).map((target) => (target.startsWith('.') ? posix.normalize(posix.join(posix.dirname(file), target)) : target));

test('rule 3: what the screens show (src/app/view/) imports only the logic and uses no browser object', () => {
  assert.ok(VIEW.length > 5);
  for (const file of VIEW) {
    for (const target of resolvedImports(file)) assert.ok(target.startsWith('src/core/') || target.startsWith('src/app/view/'), `${file} imports ${target}`);
    const code = codeOf(file);
    assert.ok(!/\b(window|document|localStorage|navigator|fetch|React)\b/.test(code), `${file} uses a browser object`);
  }
});

/*
 * The actions (src/app/state/) run under node:test with the in-memory folder: they use the logic, the view, the folder
 * access and the file reading, never a screen, never the files Vite packs (they get them through content.ts), and only
 * use-store.ts knows React.
 */
const STATE_MAY_IMPORT = ['src/core/', 'src/app/view/', 'src/app/state/', 'src/app/platform/workspace.ts', 'src/app/platform/files.ts'];

test('the actions (src/app/state/) import no screen, no packed file and no library; only use-store.ts uses React', () => {
  assert.ok(STATE.length > 5);
  for (const file of STATE) {
    for (const target of resolvedImports(file)) {
      if (file === 'src/app/state/use-store.ts' && target === 'react') continue;
      assert.ok(STATE_MAY_IMPORT.some((part) => target.startsWith(part)), `${file} imports ${target}`);
    }
  }
});

test('the platform part (src/app/platform/) imports only the logic and the packed files', () => {
  for (const file of filesOf('src/app/platform', /\.ts$/)) {
    for (const target of resolvedImports(file)) assert.ok(target.startsWith('src/core/') || /\.(csv\?raw|json)$/.test(target), `${file} imports ${target}`);
  }
});

test('the hosts and the app reach the logic, never the other way round; the command line does not import the app', () => {
  for (const target of importsOf('src/hosts/cli.ts')) assert.ok(target.startsWith('node:') || target.startsWith('../core/'), `cli.ts imports ${target}`);
});

/*
 * The screens (src/app/screens/<screen>/), the shared parts (src/app/ui/) and the shell (src/app/shell/) that shows them.
 * Rule 4: a screen imports only files of its own folder, the shared parts, and the state, view, platform and logic.
 * The shared parts never import a screen or the shell; only the shell (and main.tsx) imports the screens.
 * Since piece A7 there is no exception, and none may be added.
 */
const SCREENS = filesOf('src/app/screens', /\.tsx?$/);
const UI = filesOf('src/app/ui', /\.tsx?$/);
const screenOf = (path: string): string => path.split('/')[3] ?? '';

test('rule 4: a screen does not import another screen', () => {
  assert.ok(new Set(SCREENS.map(screenOf)).size >= 8);
  for (const file of SCREENS) {
    for (const target of resolvedImports(file)) {
      if (target.startsWith('src/app/screens/')) assert.equal(screenOf(target), screenOf(file), `${file} imports ${target}: move the shared part to src/app/ui/`);
      assert.ok(!target.startsWith('src/app/shell/'), `${file} imports the shell (${target})`);
    }
  }
});

test('rule 4: the shared parts (src/app/ui/) import no screen and not the shell; only the shell imports the screens', () => {
  for (const file of UI) {
    for (const target of resolvedImports(file)) assert.ok(!target.startsWith('src/app/screens/') && !target.startsWith('src/app/shell/'), `${file} imports ${target}`);
  }
  const others = filesOf('src/app', /\.tsx?$/).filter((file) => !file.startsWith('src/app/screens/') && !file.startsWith('src/app/shell/'));
  for (const file of others) {
    for (const target of resolvedImports(file)) assert.ok(!target.startsWith('src/app/screens/'), `${file} imports a screen (${target}): only the shell may`);
  }
  assert.ok(!filesOf('src/app', /\.tsx?$/).some((file) => file.startsWith('src/app/components/')), 'src/app/components/ is gone: screens go to src/app/screens/<screen>/, shared parts to src/app/ui/');
});

test('the app reaches the network nowhere: the page keeps its Content Security Policy', () => {
  const html = read('src/app/index.html');
  assert.match(html, /default-src 'none'/);
  for (const file of filesOf('src', /\.tsx?$/)) {
    const code = codeOf(file);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(code), `${file} calls the network`);
  }
});
