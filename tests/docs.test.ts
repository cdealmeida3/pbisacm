import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { unchangedVendoredFiles } from '../tools/privacy-guard.ts';

/*
 * The documents stay true to the repository:
 *   1. every relative link of every Markdown file resolves, and so does its #anchor (copied skills are upstream's and
 *      are skipped while unchanged, as in the privacy guard);
 *   2. docs/ARCHITECTURE.md names every module of src/.
 */

const root = join(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'app', 'dist']);

function filesOf(folder: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(folder)) {
    if (SKIP.has(name)) continue;
    const path = join(folder, name);
    if (statSync(path).isDirectory()) out.push(...filesOf(path, pattern));
    else if (pattern.test(name)) out.push(path);
  }
  return out.sort();
}

/** The anchors GitHub gives the headings of a Markdown file. */
function anchorsOf(text: string): Set<string> {
  const anchors = new Set<string>();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    anchors.add(match[1]!.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-'));
  }
  return anchors;
}

/** The text without code blocks and inline code, where a "](" is not a link. */
const withoutCode = (text: string): string => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

test('every relative link of the documents resolves', () => {
  const broken: string[] = [];
  const copied = unchangedVendoredFiles(root);
  const files = filesOf(root, /\.md$/).filter((file) => !copied.has(relative(root, file).replace(/\\/g, '/')));
  assert.ok(files.length > 10);
  for (const file of files) {
    for (const match of withoutCode(readFileSync(file, 'utf8')).matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1]!;
      if (/^[a-z]+:/i.test(link)) continue;
      const [target, anchor] = link.split('#') as [string, string | undefined];
      const path = target ? join(dirname(file), decodeURIComponent(target)) : file;
      const where = `${relative(root, file)}: ${link}`;
      if (!existsSync(path)) { broken.push(where); continue; }
      if (anchor && path.endsWith('.md') && !anchorsOf(readFileSync(path, 'utf8')).has(anchor)) broken.push(`${where} (no such heading)`);
    }
  }
  assert.deepEqual(broken, []);
});

test('docs/ARCHITECTURE.md names every module of src/', () => {
  const text = readFileSync(join(root, 'docs', 'ARCHITECTURE.md'), 'utf8');
  const missing = filesOf(join(root, 'src'), /\.(ts|tsx|html|css)$/).map((file) => basename(file)).filter((name) => !text.includes(`${name}\``));
  assert.deepEqual(missing, [], 'Add these modules to the module map of docs/ARCHITECTURE.md (section 5)');
});
