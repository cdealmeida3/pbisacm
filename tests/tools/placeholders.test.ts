import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PLACEHOLDERS_DOC, placeholdersDoc, readRegistry, registryProblems, scan, scanProblems, type Registry } from '../../tools/placeholders.ts';

/*
 * The stand-ins of the repository are listed in tools/placeholders.json (D266): every entry is still found, no generic
 * placeholder is left unlisted, and docs/PLACEHOLDERS.md is written from the registry.
 */

const root = join(import.meta.dirname, '../..');

test('every stand-in of the registry is found, and no placeholder is left unlisted', () => {
  assert.deepEqual(scanProblems(scan(root)), []);
});

test('docs/PLACEHOLDERS.md is what npm run docs writes', () => {
  // A Windows checkout may turn LF into CRLF; the content is what counts.
  assert.equal(readFileSync(join(root, PLACEHOLDERS_DOC), 'utf8').replace(/\r\n/g, '\n'), placeholdersDoc(readRegistry(root)), 'docs/PLACEHOLDERS.md is out of date: run npm run docs');
});

// The generic shapes are put together from parts, so that this file does not hold them itself.
const redacted = `${'REDAC'}TED`;
const doe = `Jane ${'D'}oe`;

/** A small repository in a temporary folder with these files, scanned with this registry. */
function scanned(files: Record<string, string>, registry: Registry): ReturnType<typeof scan> {
  const folder = mkdtempSync(join(tmpdir(), 'placeholders-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, file)), { recursive: true });
      writeFileSync(join(folder, file), text);
    }
    return scan(folder, registry);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const registry = (entries: Registry['entries'], shapes: Registry['shapes'] = []): Registry => ({ note: '', entries, shapes });
const person = { id: 'person.sample', group: 'people', invented: ['Ada Example'], use: 'stays-invented' as const, label: 'Invented people' };

test('an entry that matches nothing is stale', () => {
  const result = scanned({ 'notes.md': 'Nobody here.\n' }, registry([person]));
  assert.deepEqual(scanProblems(result), ['person.sample: Ada Example matches nothing: remove it from tools/placeholders.json']);
});

test('one word of an entry that matches nothing is stale, even when the other words are found', () => {
  const result = scanned({ 'notes.md': 'Ada Example\n' }, registry([{ ...person, invented: ['Ada Example', 'Bo Gone'] }]));
  assert.deepEqual(result.stale, ['person.sample: Bo Gone']);
});

test('a generic placeholder that no entry covers fails, with its file and line', () => {
  const result = scanned({ 'src/a.ts': `// owner: Ada Example\nconst name = '${redacted}';\n` }, registry([person]));
  assert.deepEqual(scanProblems(result), ['src/a.ts:2: a redaction mark that tools/placeholders.json does not list: register it, or ask the user for the real value']);
});

test('a generic placeholder that an entry or a shape covers passes; the built app is not read', () => {
  const files = { 'src/a.ts': `// "${doe} (jdo)"\n`, 'samples/s.csv': `owner\nAda Example\n`, 'app/SACM-Workbench.html': redacted };
  const shape = { id: 'doc.example', group: 'examples', pattern: `${doe.split(' ')[0]} \\w+`, use: 'stays-invented' as const, label: 'A format example' };
  const result = scanned(files, registry([person], [shape]));
  assert.deepEqual(scanProblems(result), []);
  assert.deepEqual(result.counts.map((count) => `${count.id}: ${count.hits.map((hit) => `${hit.file}:${hit.line}`).join(', ')}`), ['person.sample: samples/s.csv:2', 'doc.example: src/a.ts:1']);
});

test('an entry with use ask is listed as a question for the user, not as a problem', () => {
  const result = scanned({ 'notes.md': 'Ada Example\n' }, registry([{ ...person, use: 'ask' }]));
  assert.deepEqual(result.ask, ['person.sample']);
  assert.deepEqual(scanProblems(result), []);
});

test('an entry matches whole words only', () => {
  const result = scanned({ 'notes.md': 'AdaExampleX and Ada Examples\n' }, registry([person]));
  assert.deepEqual(result.stale, ['person.sample: Ada Example']);
});

test('a registry that is not valid gives one problem per mistake', () => {
  assert.deepEqual(registryProblems({
    entries: [{ ...person, use: 'maybe' }, { ...person, invented: [] }],
    shapes: [{ id: 'bad', group: 'g', label: 'l', use: 'kept', pattern: '(' }]
  }), [
    'entry person.sample has use "maybe"; it must be one of stays-invented, kept, ask',
    'person.sample is listed twice',
    'entry person.sample needs a list of words in invented',
    'shape bad has a pattern that is not a regular expression'
  ]);
});
