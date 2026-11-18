import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentHash, VENDORED_MANIFEST } from '../../tools/privacy-guard.ts';
import { copiedSkillProblems, forbiddenPathProblems, pinnedToolProblems, powerBiFileProblems, repositoryRuleProblems } from '../../tools/repository-rules.ts';

/*
 * The copied skills stay as upstream.json lists them (by source), a pinned tool has one version everywhere, and no
 * glossary or ADR file exists (tools/repository-rules.ts, D255, D260).
 */

test('the repository breaks no repository rule', () => {
  assert.deepEqual(repositoryRuleProblems(join(import.meta.dirname, '../..')), []);
});

const skill = '.claude/skills/some-skill/SKILL.md';
const commit = 'a'.repeat(40);

/** One source of the manifest: `listed` go into its files with their hash; `fields` change or add fields. */
function source(name: string, listed: Record<string, string>, fields: Record<string, unknown> = {}): Record<string, unknown> {
  const files = Object.fromEntries(Object.entries(listed).map(([file, text]) => [file, contentHash(text)]));
  return { name, tag: 'v1.0.0', commit, files, ...fields };
}

/**
 * A small repository in a temporary folder: `files` are written; `manifest` is written as upstream.json (an array is
 * the list of sources). Without `manifest`, no upstream.json is written.
 */
function withRepository(files: Record<string, string>, manifest: unknown[] | Record<string, unknown> | undefined, run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'repository-rules-'));
  try {
    const write = (file: string, text: string): void => { mkdirSync(join(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), text); };
    for (const [file, text] of Object.entries(files)) write(file, text);
    if (manifest) write(VENDORED_MANIFEST, JSON.stringify(Array.isArray(manifest) ? { sources: manifest } : manifest, null, 2));
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
/** The path at the start of each problem, so the wording of the sentence can change. */
const paths = (problems: string[]): string[] => problems.map((problem) => problem.split(/:? /)[0]!);

test('copied skills that are exactly as listed give no problem', () => {
  withRepository({ [skill]: 'text' }, [source('one', { [skill]: 'text' })], (root) => assert.deepEqual(copiedSkillProblems(root), []));
});

test('a copied file whose text changed gives one problem naming that file', () => {
  withRepository({ [skill]: 'text, then an edit' }, [source('one', { [skill]: 'text' })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [skill]));
});

test('an extra file in a skill folder gives one problem; an operating system file and UPSTREAM.md give none', () => {
  const extra = '.claude/skills/some-skill/NOTES.md';
  const files = { [skill]: 'text', [extra]: 'our note', '.claude/skills/some-skill/.DS_Store': 'x', '.claude/skills/UPSTREAM.md': 'ours' };
  withRepository(files, [source('one', { [skill]: 'text' })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [extra]));
});

test('a listed file that is missing gives one problem', () => {
  const missing = '.claude/skills/other-skill/SKILL.md';
  withRepository({ [skill]: 'text' }, [source('one', { [missing]: 'gone', [skill]: 'text' })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [missing]));
});

test('a manifest with unsorted files, or without a commit, gives a problem', () => {
  const later = '.claude/skills/z-skill/SKILL.md';
  const files = { [skill]: 'text', [later]: 'more' };
  withRepository(files, [source('one', { [later]: 'more', [skill]: 'text' })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
  withRepository(files, [source('one', { [skill]: 'text', [later]: 'more' }, { commit: undefined })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
});

test('files under .claude/skills/ without a valid manifest give one problem', () => {
  withRepository({ [skill]: 'text' }, undefined, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
  withRepository({ [skill]: 'text', [VENDORED_MANIFEST]: '{ not json' }, undefined, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
  withRepository({ [skill]: 'text' }, [], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
});

test('the manifest may list only copied files under .claude/skills/', () => {
  const outside = 'docs/page.md';
  withRepository({ [skill]: 'text', [outside]: 'page' }, [source('one', { [skill]: 'text', [outside]: 'page' })], (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [outside]));
});

test('a copy with CRLF line ends gives no problem (the hash uses LF)', () => {
  withRepository({ [skill]: 'a\r\nb\r\n' }, [source('one', { [skill]: 'a\nb\n' })], (root) => assert.deepEqual(copiedSkillProblems(root), []));
});

test('a folder without .claude/skills/ and without a manifest gives no problem', () => {
  withRepository({ 'docs/page.md': 'page' }, undefined, (root) => assert.deepEqual(repositoryRuleProblems(root), []));
});

/* Several sources (D260): each keeps its own tag, commit and files. */

const second = '.claude/skills/web-skill/SKILL.md';

test('two sources whose files are exactly as listed give no problem', () => {
  const manifest = [source('one', { [skill]: 'text' }), source('two', { [second]: 'web' }, { tag: 'v2.0.0', commit: 'b'.repeat(40) })];
  withRepository({ [skill]: 'text', [second]: 'web' }, manifest, (root) => assert.deepEqual(copiedSkillProblems(root), []));
});

test('a path listed in two sources gives one problem naming that path', () => {
  const manifest = [source('one', { [skill]: 'text' }), source('two', { [skill]: 'text', [second]: 'web' })];
  withRepository({ [skill]: 'text', [second]: 'web' }, manifest, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [skill]));
});

test('a second source without a commit, or with a branch name as commit, gives one problem', () => {
  for (const fields of [{ commit: undefined }, { commit: 'main' }]) {
    const manifest = [source('one', { [skill]: 'text' }), source('two', { [second]: 'web' }, fields)];
    withRepository({ [skill]: 'text', [second]: 'web' }, manifest, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
  }
});

test('two sources with the same name, or a source without a name, give one problem each', () => {
  const same = [source('one', { [skill]: 'text' }), source('one', { [second]: 'web' })];
  withRepository({ [skill]: 'text', [second]: 'web' }, same, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
  const nameless = [source('one', { [skill]: 'text' }), source('', { [second]: 'web' })];
  withRepository({ [skill]: 'text', [second]: 'web' }, nameless, (root) => assert.deepEqual(paths(copiedSkillProblems(root)), [VENDORED_MANIFEST]));
});

test('a manifest in the old form (files without sources) gives one problem that says how to write it', () => {
  const old = { tag: 'v1.0.0', commit, files: { [skill]: contentHash('text') } };
  withRepository({ [skill]: 'text' }, old, (root) => {
    const problems = copiedSkillProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^\.claude\/skills\/upstream\.json: write the files under sources/);
  });
});

/* Rule 3: a pinned tool has the same version in upstream.json, .claude/settings.json and docs/agents/web-guidance.md. */

const settings = (version: string): string => JSON.stringify({ permissions: { allow: [`Bash(npx -y web-tool@${version} search:*)`] } });
const guide = (version: string): string => `Run \`npx -y web-tool@${version} search "words"\`, never \`web-tool@latest\`.\n`;
const toolSource = (tag: string, tool = 'web-tool@1.2.3'): Record<string, unknown> => source('two', { [second]: 'web' }, { tag, tool });

test('a pinned tool with the same version everywhere gives no problem', () => {
  const files = { [second]: 'web', '.claude/settings.json': settings('1.2.3'), 'docs/agents/web-guidance.md': guide('1.2.3') };
  withRepository(files, [toolSource('v1.2.3')], (root) => assert.deepEqual(pinnedToolProblems(root), []));
});

test('a pinned tool with another version in one file gives one problem naming that file', () => {
  const files = { [second]: 'web', '.claude/settings.json': settings('1.2.3'), 'docs/agents/web-guidance.md': guide('1.2.4') };
  withRepository(files, [toolSource('v1.2.3')], (root) => assert.deepEqual(paths(pinnedToolProblems(root)), ['docs/agents/web-guidance.md']));
  const claude = { ...files, 'docs/agents/web-guidance.md': guide('1.2.3'), 'CLAUDE.md': guide('1.2.2') };
  withRepository(claude, [toolSource('v1.2.3')], (root) => assert.deepEqual(paths(pinnedToolProblems(root)), ['CLAUDE.md']));
});

test('the allow list names the pinned tool only with its version: never @latest, a range or no version', () => {
  const guideOk = { [second]: 'web', 'docs/agents/web-guidance.md': guide('1.2.3') };
  for (const extra of ['web-tool@latest', 'web-tool@^1.2.3', 'web-tool@1', 'web-tool search']) {
    const allow = JSON.stringify({ permissions: { allow: [`Bash(npx -y web-tool@1.2.3 search:*)`, `Bash(npx -y ${extra}:*)`] } });
    withRepository({ ...guideOk, '.claude/settings.json': allow }, [toolSource('v1.2.3')], (root) => {
      assert.deepEqual(paths(pinnedToolProblems(root)), ['.claude/settings.json'], extra);
    });
  }
  const other = JSON.stringify({ permissions: { allow: ['Bash(npx -y web-tool@1.2.3 search:*)', 'Bash(npx -y other-web-tool@latest:*)'] } });
  withRepository({ ...guideOk, '.claude/settings.json': other }, [toolSource('v1.2.3')], (root) => assert.deepEqual(pinnedToolProblems(root), []));
});

test('a pinned tool missing from a file that must name it gives one problem naming that file', () => {
  const files = { [second]: 'web', 'docs/agents/web-guidance.md': guide('1.2.3') };
  withRepository(files, [toolSource('v1.2.3')], (root) => assert.deepEqual(paths(pinnedToolProblems(root)), ['.claude/settings.json']));
});

test('a tool whose version is not the tag of its source gives one problem naming the manifest', () => {
  const files = { [second]: 'web', '.claude/settings.json': settings('1.2.3'), 'docs/agents/web-guidance.md': guide('1.2.3') };
  withRepository(files, [toolSource('v1.2.4')], (root) => assert.deepEqual(paths(pinnedToolProblems(root)), [VENDORED_MANIFEST]));
  withRepository(files, [toolSource('v1.2.3', 'web-tool@latest')], (root) => assert.deepEqual(paths(pinnedToolProblems(root)), [VENDORED_MANIFEST]));
});

test('a glossary, an ADR folder or a root CONTEXT.md gives one problem each; the allowed files give none', () => {
  const forbidden = {
    'GLOSSARY.md': 'words', 'src/a/glossary.md': 'words', 'GLOSSARY-MAP.md': 'map', 'docs/adr/0001-x.md': 'decision',
    'src/a/docs/adr/0001-y.md': 'decision', 'CONTEXT.md': 'context'
  };
  const allowed = { 'docs/CONTEXT.md': 'context', '.claude/skills/domain-modeling/GLOSSARY-FORMAT.md': 'format', '.claude/skills/domain-modeling/ADR-FORMAT.md': 'format' };
  withRepository({ ...forbidden, ...allowed }, undefined, (root) => {
    assert.deepEqual(paths(forbiddenPathProblems(root)), ['CONTEXT.md', 'GLOSSARY-MAP.md', 'GLOSSARY.md', 'docs/adr/', 'src/a/docs/adr/', 'src/a/glossary.md']);
  });
});

test('a .pbix, or the cache or personal settings of Power BI Desktop in a .pbi folder, gives one problem each', () => {
  const forbidden = {
    'powerbi/Report.pbix': 'data', 'Other.PBIX': 'data', 'powerbi/M.SemanticModel/.pbi/cache.abf': 'data',
    'powerbi/M.SemanticModel/.pbi/localSettings.json': '{}', 'powerbi/R.Report/.pbi/localSettings.json': '{}', 'powerbi/R.Report/.pbi/editorSettings.json': '{}'
  };
  const allowed = { 'powerbi/R.pbip': '{}', 'powerbi/M.SemanticModel/definition.pbism': '{}', 'docs/localSettings.json': '{}', 'powerbi/M.SemanticModel/.pbi/other.json': '{}' };
  withRepository({ ...forbidden, ...allowed }, undefined, (root) => {
    assert.deepEqual(paths(powerBiFileProblems(root)), Object.keys(forbidden).sort());
  });
});
