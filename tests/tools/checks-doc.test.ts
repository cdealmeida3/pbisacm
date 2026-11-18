import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKS_DOC, checksDoc, readDocInput } from '../../tools/checks-doc.ts';
import { loadPackFiles } from '../../src/hosts/cli.ts';

/* docs/CHECKS.md is written from the check packs (tools/checks-doc.ts), so it is never out of date. */

const root = join(import.meta.dirname, '../..');

test('docs/CHECKS.md is what npm run docs writes', () => {
  // A Windows checkout may turn LF into CRLF; the content is what counts.
  assert.equal(readFileSync(join(root, CHECKS_DOC), 'utf8').replace(/\r\n/g, '\n'), checksDoc(readDocInput(root)), 'docs/CHECKS.md is out of date: run npm run docs');
});

test('docs/CHECKS.md lists every check once', () => {
  const text = readFileSync(join(root, CHECKS_DOC), 'utf8');
  const ids = loadPackFiles(root).map((file) => (file.pack as { id: string }).id);
  for (const id of ids) assert.equal(text.split(`| \`${id}\` |`).length - 1, 1, id);
});

test('every check id named in the decision log exists', () => {
  const ids = new Set(readDocInput(root).packs.map((pack) => pack.id));
  const decisions = readFileSync(join(root, 'docs', 'DECISIONS.md'), 'utf8');
  for (const word of decisions.match(/\b(?:RESP|CRIT|DESC|NAME|TAG|REL|SUPPORT|EPO|OFFERING|APP|READY|UNDER|LIFECYCLE|CONTRACT)-[A-Z-]+\b/g) ?? []) {
    assert.ok(ids.has(word), `docs/DECISIONS.md names ${word}, which is not a check`);
  }
});
