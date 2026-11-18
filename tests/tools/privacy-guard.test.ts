import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentHash, privacyProblems, privateTerms, problemsIn, VENDORED_MANIFEST } from '../../tools/privacy-guard.ts';

/* The repository holds no real link, host or email address (tools/privacy-guard.ts, D266). */

// With PRIVACY_TERMS or PRIVACY_TERMS_LIST set (a developer's file, the Actions secret in CI), also none of the private words.
test('no file of the repository holds a link, a host or an email address that is not invented, nor a private word', () => {
  const problems = privacyProblems(join(import.meta.dirname, '../..'), privateTerms());
  assert.deepEqual(problems.map((problem) => `${problem.file}:${problem.line}: ${problem.what}`), []);
});

// The examples are put together from parts, so that this file does not hold them itself.
const at = '@';
const dot = '.';

test('the guard finds a real link, a tenant host and a real email address', () => {
  const text = [
    `See https://${'tenant'}${dot}share${'point'}${dot}com/sites/x`,
    `the instance tenant${dot}service-${'now'}${dot}com`,
    `write to someone${at}company${dot}org`,
    `a page http://${'intra'}net/home`
  ].join('\n');
  assert.deepEqual(problemsIn('f', text).map((problem) => `${problem.line} ${problem.what}`), [
    `1 link to tenant${dot}share${'point'}${dot}com`, `4 link to ${'intra'}net`, `1 host tenant${dot}share${'point'}${dot}com`,
    `2 host tenant${dot}service-${'now'}${dot}com`, `3 email address at company${dot}org`
  ]);
});

test('the guard lets invented and public standard addresses pass', () => {
  const text = [
    `https://portal${dot}example${dot}com/sacm`, `ada${at}example${dot}com`, `https://contoso${dot}service-${'now'}${dot}com/sp`,
    `http://www${dot}w3${dot}org/2000/svg`, `https://teams${dot}microsoft${dot}com/l/chat/0/0`, 'https://${host}/x', 'https://…'
  ].join('\n');
  assert.deepEqual(problemsIn('f', text), []);
});

test('private words are found as whole words, in any case, and never printed', () => {
  const problems = problemsIn('f', 'The Acme team\nacmeville\nACME', ['acme']);
  assert.deepEqual(problems.map((problem) => problem.line), [1, 3]);
  assert.ok(problems.every((problem) => !/acme/i.test(problem.what)));
});

/* Copied third-party files (.claude/skills/, D254): skipped only while they match the sha256 of the manifest. */

const foreignLink = `See https://${'some'}-${'vendor'}${dot}io/page`;

/**
 * A small repository in a temporary folder: `files` are written, `listed` go into the first source of the manifest with
 * their hash, `listedByOther` into a second source.
 */
function withRepository(
  files: Record<string, string>, listed: Record<string, string>, run: (root: string) => void, listedByOther: Record<string, string> = {}
): void {
  const root = mkdtempSync(join(tmpdir(), 'privacy-guard-'));
  try {
    const write = (file: string, text: string): void => { mkdirSync(join(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), text); };
    for (const [file, text] of Object.entries(files)) write(file, text);
    const hashes = (texts: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(texts).map(([file, text]) => [file, contentHash(text)]));
    const sources = [{ name: 'one', files: hashes(listed) }, { name: 'two', files: hashes(listedByOther) }];
    write(VENDORED_MANIFEST, JSON.stringify({ sources }, null, 2));
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const found = (root: string, terms: string[] = []): string[] => privacyProblems(root, terms).map((problem) => `${problem.file} ${problem.what}`);

test('an unchanged copied file is not checked for links', () => {
  const file = '.claude/skills/some-skill/SKILL.md';
  withRepository({ [file]: foreignLink }, { [file]: foreignLink }, (root) => assert.deepEqual(found(root), []));
});

test('an unchanged copied file with CRLF line ends is still recognised', () => {
  const file = '.claude/skills/some-skill/SKILL.md';
  withRepository({ [file]: `a\r\n${foreignLink}\r\n` }, { [file]: `a\n${foreignLink}\n` }, (root) => assert.deepEqual(found(root), []));
});

test('a copied file that was changed is checked like any other file', () => {
  const file = '.claude/skills/some-skill/SKILL.md';
  withRepository({ [file]: `${foreignLink}\nan edit` }, { [file]: foreignLink }, (root) => {
    assert.deepEqual(found(root), [`${file} link to some-vendor${dot}io`]);
  });
});

test('a file that the manifest does not list is checked, also next to copied files', () => {
  const listed = '.claude/skills/some-skill/SKILL.md';
  const added = '.claude/skills/some-skill/NOTES.md';
  withRepository({ [listed]: 'no link', [added]: foreignLink }, { [listed]: 'no link' }, (root) => {
    assert.deepEqual(found(root), [`${added} link to some-vendor${dot}io`]);
  });
});

test('the manifest cannot exempt a file outside .claude/skills/', () => {
  const outside = 'docs/page.md';
  const climbing = '.claude/skills/../../docs/other.md';
  withRepository({ [outside]: foreignLink, 'docs/other.md': foreignLink }, { [outside]: foreignLink, [climbing]: foreignLink }, (root) => {
    assert.deepEqual(found(root), [`docs/other.md link to some-vendor${dot}io`, `${outside} link to some-vendor${dot}io`]);
  });
});

test('private words are still found in an unchanged copied file', () => {
  const file = '.claude/skills/some-skill/SKILL.md';
  const text = `${foreignLink}\nThe Acme team`;
  withRepository({ [file]: text }, { [file]: text }, (root) => {
    assert.deepEqual(found(root, ['acme']), [`${file} a private word of PRIVACY_TERMS`]);
  });
});

test('a file of a second source is skipped while unchanged and checked once it is changed', () => {
  const file = '.claude/skills/web-skill/guides/page.md';
  withRepository({ [file]: foreignLink }, {}, (root) => assert.deepEqual(found(root), []), { [file]: foreignLink });
  withRepository({ [file]: `${foreignLink}\nan edit` }, {}, (root) => {
    assert.deepEqual(found(root), [`${file} link to some-vendor${dot}io`]);
  }, { [file]: foreignLink });
});

test('a manifest in the old form (files without sources) exempts no file', () => {
  const file = '.claude/skills/some-skill/SKILL.md';
  const root = mkdtempSync(join(tmpdir(), 'privacy-guard-'));
  try {
    mkdirSync(join(root, '.claude/skills/some-skill'), { recursive: true });
    writeFileSync(join(root, file), foreignLink);
    writeFileSync(join(root, VENDORED_MANIFEST), JSON.stringify({ files: { [file]: contentHash(foreignLink) } }));
    assert.deepEqual(found(root), [`${file} link to some-vendor${dot}io`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the private words come from the file and from the secret text; none when neither is set', () => {
  assert.deepEqual(privateTerms('', ''), []);
  assert.deepEqual(privateTerms('', 'Acme\r\n  # a comment\n\n  Initech Labs  # the old name\nAcme'), ['Acme', 'Initech Labs']);
  const root = mkdtempSync(join(tmpdir(), 'privacy-terms-'));
  try {
    writeFileSync(join(root, 'terms.txt'), 'Globex\n');
    assert.deepEqual(privateTerms(join(root, 'terms.txt'), 'Acme'), ['Globex', 'Acme']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a private word in a file is found by file and line, and the word itself is never in the problem', () => {
  withRepository({ 'docs/page.md': 'one\nThe initech labs team\n' }, {}, (root) => {
    const problems = privacyProblems(root, ['Initech Labs']);
    assert.deepEqual(problems.map((problem) => `${problem.file}:${problem.line}: ${problem.what}`), ['docs/page.md:2: a private word of PRIVACY_TERMS']);
    assert.ok(!JSON.stringify(problems).toLowerCase().includes('labs'));
  });
});
