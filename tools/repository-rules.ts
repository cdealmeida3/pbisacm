// Repository rules: fails when a file is where the rules say it must not be.
//   1. The copied agent skills (.claude/skills/, D254, D260) are exactly the files of .claude/skills/upstream.json, byte
//      for byte. The manifest lists them by source, each with its own tag and commit. They change only by an update
//      pull request (.claude/skills/UPSTREAM.md, "How to update").
//   2. No GLOSSARY.md, GLOSSARY-MAP.md or docs/adr/ anywhere, and no CONTEXT.md or CONTEXT-MAP.md at the root. The words
//      are in docs/DATA-MODEL.md §1 and the decisions in docs/DECISIONS.md (docs/agents/domain.md).
//   3. A source with a `tool` (a command-line tool its skill runs, D260) pins it: the version is the tag of the source,
//      and every file that names the tool names that version. An update that forgets one place fails.
//   4. No file of Power BI Desktop that holds data or one person's settings (plan §3.1): no .pbix, and no cache.abf,
//      localSettings.json or editorSettings.json in a .pbi folder. Desktop writes them next to the project on a computer
//      that opens it, and .gitignore keeps them out, so in a git folder only the committed files count.
//   node tools/repository-rules.ts     checks the repository (also run by npm test)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contentHash, isObject, VENDORED_MANIFEST, vendoredEntries } from './privacy-guard.ts';

const SKILLS_FOLDER = '.claude/skills/';
/** Our own files in the skills folder: they are not copied, so the manifest does not list them. */
const OWN_FILES = new Set(['.claude/skills/UPSTREAM.md', VENDORED_MANIFEST]);
/** Files an operating system leaves behind (as in .gitignore). Ignored, so a test on a Mac or Windows computer passes. */
const OS_FILES = /^(\.DS_Store|\._.*|Thumbs\.db|ehthumbs\.db|desktop\.ini)$/i;
/** Not walked: generated or third-party folders (as the privacy guard). */
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', 'dist', '.build']);

/** Every file under `folder`, relative to `root`, with / as separator. Files of the operating system are left out. */
function filesUnder(root: string, folder: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(join(dir, entry.name)); continue; }
      if (!OS_FILES.test(entry.name)) out.push(relative(root, join(dir, entry.name)).replace(/\\/g, '/'));
    }
  };
  walk(join(root, folder));
  return out;
}

interface Source { name?: unknown; tag?: unknown; commit?: unknown; tool?: unknown; files?: unknown }
interface Manifest { sources?: unknown; files?: unknown }

/** The manifest, or undefined when it is missing or not valid JSON. */
function readManifest(path: string): Manifest | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(value) ? value as Manifest : undefined;
  } catch {
    return undefined;
  }
}

/** The sources of a manifest, or undefined when `sources` is not a list. An entry that is not an object becomes {}. */
function manifestSources(manifest: Manifest): Source[] | undefined {
  return Array.isArray(manifest.sources) ? manifest.sources.map((source: unknown) => isObject(source) ? source as Source : {}) : undefined;
}

/** A name to show for a source in a problem: its name, or its place in the list. */
const sourceLabel = (source: Source, index: number): string => typeof source.name === 'string' && source.name ? source.name : `number ${index + 1}`;

/** Rule 1: the files under .claude/skills/ are exactly the files of upstream.json, each with its sha256. */
export function copiedSkillProblems(root: string): string[] {
  const folderExists = existsSync(join(root, SKILLS_FOLDER));
  const manifestPath = join(root, VENDORED_MANIFEST);
  if (!folderExists && !existsSync(manifestPath)) return [];
  const manifest = readManifest(manifestPath);
  if (!manifest) return [`${VENDORED_MANIFEST} is missing or not valid JSON`];
  const sources = manifestSources(manifest);
  if (!sources && manifest.files !== undefined) return [`${VENDORED_MANIFEST}: write the files under sources (UPSTREAM.md, How to update)`];
  if (!sources?.length) return [`${VENDORED_MANIFEST}: no list of sources`];

  const problems: string[] = [];
  const names = new Set<string>();
  const known = new Set<string>();
  sources.forEach((source, index) => {
    const where = `${VENDORED_MANIFEST}: source ${sourceLabel(source, index)}`;
    if (typeof source.name !== 'string' || !source.name) problems.push(`${where}: no name`);
    else if (names.has(source.name)) problems.push(`${where}: the name is used by two sources`);
    else names.add(source.name);
    if (typeof source.tag !== 'string' || !source.tag) problems.push(`${where}: no tag`);
    if (typeof source.commit !== 'string' || !/^[0-9a-f]{40}$/.test(source.commit)) problems.push(`${where}: no commit of 40 hex characters`);
    const files = isObject(source.files) ? source.files : undefined;
    if (!files) { problems.push(`${where}: no list of files`); return; }

    const keys = Object.keys(files);
    if (keys.join('\n') !== [...keys].sort().join('\n')) problems.push(`${where}: the files are not in sorted order`);

    for (const [file, hash] of Object.entries(files)) {
      if (typeof hash !== 'string') { problems.push(`${where}: the hash of ${file} is not a text`); continue; }
      if (!file.startsWith(SKILLS_FOLDER) || file.split('/').includes('..') || OWN_FILES.has(file)) {
        problems.push(`${file}: listed in ${VENDORED_MANIFEST}, but only copied files under ${SKILLS_FOLDER} may be listed`);
        continue;
      }
      if (known.has(file)) { problems.push(`${file}: listed in two sources of ${VENDORED_MANIFEST}. A file comes from one source only.`); continue; }
      known.add(file);
      const path = join(root, file);
      if (!existsSync(path)) { problems.push(`${file}: listed in upstream.json but missing`); continue; }
      if (contentHash(readFileSync(path, 'utf8')) !== hash) {
        problems.push(`${file}: changed since it was copied. A copied skill changes only by an update pull request (.claude/skills/UPSTREAM.md, How to update). Put our own rules in docs/agents/ or CLAUDE.md.`);
      }
    }
  });

  if (folderExists) {
    for (const file of filesUnder(root, SKILLS_FOLDER)) {
      if (known.has(file) || OWN_FILES.has(file)) continue;
      problems.push(`${file}: not in ${VENDORED_MANIFEST}. Copied skills come only from upstream; our own rules go in docs/agents/ or CLAUDE.md.`);
    }
  }
  return problems.sort();
}

/** The allow list of Claude Code: every mention of a pinned tool there has exactly its version (never `@latest`). */
const TOOL_ALLOWED_IN = '.claude/settings.json';
/** Files that must name a pinned tool, with its version. Today only modern-web-guidance has a tool (D260). */
const TOOL_REQUIRED_IN = [TOOL_ALLOWED_IN, 'docs/agents/web-guidance.md'];
/** Files that may name a pinned tool; when they do, it is with its version. DECISIONS.md is a log and keeps old versions. */
const TOOL_MENTIONED_IN = [...TOOL_REQUIRED_IN, 'CLAUDE.md', '.claude/skills/UPSTREAM.md'];

/** Rule 3: a pinned tool has one version: the tag of its source, in upstream.json and in every file that names it. */
export function pinnedToolProblems(root: string): string[] {
  const manifest = readManifest(join(root, VENDORED_MANIFEST));
  const sources = manifest ? manifestSources(manifest) ?? [] : [];
  const problems: string[] = [];
  sources.forEach((source, index) => {
    if (source.tool === undefined) return;
    const where = `${VENDORED_MANIFEST}: source ${sourceLabel(source, index)}`;
    const pinned = typeof source.tool === 'string' ? /^((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(\d[0-9A-Za-z.+-]*)$/.exec(source.tool) : null;
    if (!pinned) { problems.push(`${where}: the tool is not written as <name>@<version>`); return; }
    const name = pinned[1]!;
    const version = pinned[2]!;
    if (typeof source.tag !== 'string' || source.tag.replace(/^v/, '') !== version) problems.push(`${where}: the tool version ${version} is not the tag ${String(source.tag)}`);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // In prose a mention counts when a version number follows (`@latest` may be named as what not to do). In the
    // allow list every mention counts, also one without a version or with `@latest`.
    const versioned = new RegExp(`(?<![\\w@/.-])${escaped}@(\\d[0-9A-Za-z.+-]*[0-9A-Za-z])`, 'g');
    const any = new RegExp(`(?<![\\w@/.-])${escaped}(?![\\w/-])(?:@([^\\s"'\`:)*]*))?`, 'g');
    for (const file of TOOL_MENTIONED_IN) {
      const path = join(root, file);
      const pattern = file === TOOL_ALLOWED_IN ? any : versioned;
      const versions = existsSync(path) ? [...readFileSync(path, 'utf8').matchAll(pattern)].map((match) => match[1] ?? '') : [];
      if (!versions.length && TOOL_REQUIRED_IN.includes(file)) problems.push(`${file}: does not name ${name}@${version} (the tool of source ${sourceLabel(source, index)} in ${VENDORED_MANIFEST})`);
      for (const other of new Set(versions.filter((found) => found !== version))) {
        problems.push(`${file}: names ${other ? `${name}@${other}` : `${name} without a version`}, but ${VENDORED_MANIFEST} pins ${name}@${version}. Write the same version everywhere (UPSTREAM.md, How to update).`);
      }
    }
  });
  return problems.sort();
}

/** Rule 2: no glossary or ADR file of the skills; the words and decisions have their own documents here. */
export function forbiddenPathProblems(root: string): string[] {
  const problems: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = relative(root, join(dir, entry.name)).replace(/\\/g, '/');
      const name = entry.name.toLowerCase();
      if (entry.isDirectory()) {
        if (SKIPPED_FOLDERS.has(entry.name)) continue;
        if (name === 'adr' && path.split('/').at(-2)?.toLowerCase() === 'docs') {
          problems.push(`${path}/: a decision is the next numbered row of docs/DECISIONS.md. Move it there and delete this folder.`);
          continue;
        }
        walk(join(dir, entry.name));
        continue;
      }
      if (name === 'glossary.md' || name === 'glossary-map.md') {
        problems.push(`${path}: this repository keeps its words in docs/DATA-MODEL.md §1 (docs/agents/domain.md). Move the words there and delete this file.`);
      } else if (dir === root && (name === 'context.md' || name === 'context-map.md')) {
        problems.push(`${path}: the project context is docs/CONTEXT.md; the skills would read this file as a glossary. Delete it.`);
      }
    }
  };
  walk(root);
  return problems.sort();
}

/** The files of a git folder that git keeps (committed or added), or undefined when `root` is not a git folder. */
function trackedFiles(root: string): string[] | undefined {
  if (!existsSync(join(root, '.git'))) return undefined;
  const run = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  return run.status === 0 ? run.stdout.split('\0').filter(Boolean) : undefined;
}

/** Every file under `root`, without the skipped folders, relative and with / as separator. */
function allFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIPPED_FOLDERS.has(entry.name)) walk(join(dir, entry.name)); continue; }
      out.push(relative(root, join(dir, entry.name)).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out;
}

const PBI_LOCAL_FILES = new Set(['cache.abf', 'localsettings.json', 'editorsettings.json']);

/** Rule 4: no .pbix and no data cache or personal settings of Power BI Desktop. */
export function powerBiFileProblems(root: string): string[] {
  const problems: string[] = [];
  for (const path of trackedFiles(root) ?? allFiles(root)) {
    const parts = path.toLowerCase().split('/');
    const name = parts.at(-1) ?? '';
    if (name.endsWith('.pbix')) problems.push(`${path}: a .pbix holds the data and cannot be compared; the report is the project in powerbi/ (plan §3.1). Delete it.`);
    else if (parts.at(-2) === '.pbi' && PBI_LOCAL_FILES.has(name)) problems.push(`${path}: Power BI Desktop writes this file for one computer (its data or settings). Delete it; .gitignore keeps it out.`);
  }
  return problems.sort();
}

/** The four rules, in that order. */
export function repositoryRuleProblems(root: string): string[] {
  return [...copiedSkillProblems(root), ...forbiddenPathProblems(root), ...pinnedToolProblems(root), ...powerBiFileProblems(root)];
}

if (process.argv[1] === import.meta.filename) {
  const root = join(import.meta.dirname, '..');
  const problems = repositoryRuleProblems(root);
  for (const problem of problems) console.error(problem);
  const count = vendoredEntries(readManifest(join(root, VENDORED_MANIFEST))).length;
  console.log(problems.length ? `Repository rules: ${problems.length} problems.` : `Repository rules: the copied skills are unchanged (${count} files), each pinned tool has one version, no glossary or ADR file, and no .pbix or Power BI cache.`);
  process.exit(problems.length ? 1 : 0);
}
