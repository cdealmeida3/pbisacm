// Stand-ins: finds the words of the repository that stand in for a real value on purpose (D110, D266), from the
// registry tools/placeholders.json, and the generic placeholder shapes that no entry of the registry covers.
//   node tools/placeholders.ts           every entry and shape, with its number of lines and files
//   node tools/placeholders.ts --lines   the same, with file:line of every hit
//   node tools/placeholders.ts --doc     writes docs/PLACEHOLDERS.md from the registry (also run by npm run docs)
// It fails (exit 1) when the registry is not valid, when a word of an entry or a shape matches nothing (remove it), or when a
// generic placeholder is found that no entry or shape covers (register it, or ask the user for the real value). An
// entry with use "ask" is printed as a reminder: a thread that meets it asks the user (docs/agents/placeholders.md).
// It reads the same files as the privacy guard, without the built app and the unchanged copied skills.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isObject, repositoryFiles, unchangedVendoredFiles } from './privacy-guard.ts';

const REGISTRY = 'tools/placeholders.json';
export const PLACEHOLDERS_DOC = 'docs/PLACEHOLDERS.md';
/** What a thread does with a stand-in. */
export const USES = ['stays-invented', 'kept', 'ask'] as const;
export type Use = typeof USES[number];

export interface Entry { id: string; group: string; invented: string[]; use: Use; label: string }
export interface Shape { id: string; group: string; pattern: string; use: Use; label: string }
export interface Registry { note: string; entries: Entry[]; shapes: Shape[] }

/**
 * Generic placeholder shapes. One that no entry or shape of the registry covers fails. They are put together from
 * parts, so that this file does not find itself.
 */
const GENERIC: { what: string; pattern: RegExp }[] = [
  { what: 'a redaction mark', pattern: new RegExp(`\\b${'REDAC'}TED\\b`, 'g') },
  { what: 'a row of X', pattern: new RegExp(`\\b${'XX'}X+\\b`, 'g') },
  { what: 'filler text', pattern: new RegExp(`\\b[Ll]${'orem'} ipsum\\b`, 'g') },
  { what: 'a tag in place of a value', pattern: new RegExp(`<(?:${['NAME', 'FIRST_?NAME', 'LAST_?NAME', 'EMAIL', 'COMPANY', 'PERSON', 'USER', 'CUSTOMER', 'CLIENT', 'VENDOR', 'ORG', 'PHONE', 'ADDRESS'].join('|')})>`, 'g') },
  { what: 'a placeholder person', pattern: new RegExp(`\\b(?:John|Jane) ${'D'}oe\\b`, 'g') },
  { what: 'a dummy value', pattern: new RegExp(`\\b(?:[Dd]${'ummy'}|${'DUMMY'})\\b`, 'g') }
];

/** Files that name the stand-ins on purpose: the registry, the list written from it and this file. */
const OWN_FILES = new Set([REGISTRY, PLACEHOLDERS_DOC, 'tools/placeholders.ts']);
/** Not read: the built app (it repeats the source). */
const SKIPPED_PREFIXES = ['app/'];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A word of an entry, as a whole word. */
const wordPattern = (word: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}(?![\\p{L}\\p{N}_])`, 'gu');

/** The problems of a parsed registry: an empty list when it is valid. */
export function registryProblems(value: unknown): string[] {
  if (!isObject(value)) return [`${REGISTRY} is not an object`];
  const problems: string[] = [];
  const ids = new Set<string>();
  const common = (item: unknown, where: string): item is Record<string, unknown> => {
    if (!isObject(item)) { problems.push(`${where} is not an object`); return false; }
    for (const field of ['id', 'group', 'label']) if (typeof item[field] !== 'string' || !item[field]) problems.push(`${where} has no ${field}`);
    if (typeof item.id === 'string') { if (ids.has(item.id)) problems.push(`${item.id} is listed twice`); ids.add(item.id); }
    if (!USES.includes(item.use as Use)) problems.push(`${where} has use ${JSON.stringify(item.use)}; it must be one of ${USES.join(', ')}`);
    return true;
  };
  /** How a problem names an item: by its id, or by its place in its list. */
  const name = (kind: string, item: unknown, index: number): string => `${kind} ${isObject(item) && typeof item.id === 'string' ? item.id : index + 1}`;
  if (!Array.isArray(value.entries)) problems.push('entries is not a list');
  else value.entries.forEach((entry: unknown, index: number) => {
    const where = name('entry', entry, index);
    if (!common(entry, where)) return;
    const invented = entry.invented;
    if (!Array.isArray(invented) || !invented.length || invented.some((word) => typeof word !== 'string' || !word.trim())) problems.push(`${where} needs a list of words in invented`);
  });
  if (!Array.isArray(value.shapes)) problems.push('shapes is not a list');
  else value.shapes.forEach((shape: unknown, index: number) => {
    const where = name('shape', shape, index);
    if (!common(shape, where)) return;
    if (typeof shape.pattern !== 'string' || !shape.pattern) { problems.push(`${where} has no pattern`); return; }
    try { new RegExp(shape.pattern, 'gu'); } catch { problems.push(`${where} has a pattern that is not a regular expression`); }
  });
  return problems;
}

/** The registry of the repository at `root`. Throws with every problem when it is not valid. */
export function readRegistry(root: string): Registry {
  const value: unknown = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  const problems = registryProblems(value);
  if (problems.length) throw new Error(`${REGISTRY}: ${problems.join('; ')}`);
  return value as Registry;
}

export interface Hit { file: string; line: number; text: string }
export interface Count { id: string; use: Use; label: string; hits: Hit[] }
/** `stale`: an entry word or a shape that matches nothing, as "<id>" for a shape and "<id>: <word>" for a word. */
export interface Scan { counts: Count[]; stale: string[]; unregistered: (Hit & { what: string })[]; ask: string[] }

const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The files the scanner reads, relative to `root`. */
function scannedFiles(root: string): string[] {
  const vendored = unchangedVendoredFiles(root);
  return repositoryFiles(root).filter((file) => !OWN_FILES.has(file) && !vendored.has(file) && !SKIPPED_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

/** Every stand-in of the registry in the files of `root`, the stale entries and the generic placeholders no entry covers. */
export function scan(root: string, registry: Registry = readRegistry(root)): Scan {
  const items = [
    ...registry.entries.map((entry) => ({ ...entry, patterns: entry.invented.map((word) => ({ name: `${entry.id}: ${word}`, pattern: wordPattern(word) })) })),
    ...registry.shapes.map((shape) => ({ ...shape, patterns: [{ name: shape.id, pattern: new RegExp(shape.pattern, 'gu') }] }))
  ];
  /** Every entry word and shape not found yet. */
  const unseen = new Set(items.flatMap((item) => item.patterns.map((one) => one.name)));
  const counts: Count[] = items.map((item) => ({ id: item.id, use: item.use, label: item.label, hits: [] }));
  const unregistered: Scan['unregistered'] = [];
  for (const file of scannedFiles(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    /** The places of the registered stand-ins in this file, to know which generic hits they cover. */
    const covered: [number, number][] = [];
    items.forEach((item, index) => {
      const lines = new Set<number>();
      for (const { name, pattern } of item.patterns) {
        for (const match of text.matchAll(pattern)) {
          if (!match[0]) continue;
          unseen.delete(name);
          covered.push([match.index, match.index + match[0].length]);
          const line = lineAt(text, match.index);
          if (!lines.has(line)) { lines.add(line); counts[index]!.hits.push({ file, line, text: match[0] }); }
        }
      }
    });
    for (const generic of GENERIC) {
      for (const match of text.matchAll(generic.pattern)) {
        const start = match.index, end = start + match[0].length;
        if (covered.some(([from, to]) => from <= start && end <= to)) continue;
        unregistered.push({ file, line: lineAt(text, start), text: match[0], what: generic.what });
      }
    }
  }
  for (const count of counts) count.hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    counts,
    stale: [...unseen],
    unregistered,
    ask: counts.filter((count) => count.use === 'ask').map((count) => count.id)
  };
}

/** The problems that fail npm test: stale entries and unregistered placeholders. */
export function scanProblems(result: Scan): string[] {
  return [
    ...result.stale.map((id) => `${id} matches nothing: remove it from ${REGISTRY}`),
    ...result.unregistered.map((hit) => `${hit.file}:${hit.line}: ${hit.what} that ${REGISTRY} does not list: register it, or ask the user for the real value`)
  ];
}

const USE_WORDS: Record<Use, string> = {
  'stays-invented': 'Stays invented',
  kept: 'Real, kept',
  ask: 'Ask the user'
};

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The text of docs/PLACEHOLDERS.md. */
export function placeholdersDoc(registry: Registry): string {
  const lines = [
    '# Stand-ins',
    '',
    '<!-- Written by tools/placeholders.ts from tools/placeholders.json. Do not edit: run `npm run docs`. -->',
    '',
    'Some words of this repository stand in for a real value on purpose: the samples and tests use invented people, addresses and IDs ([DECISIONS.md](DECISIONS.md) D110, D266). The real values come from the real reports and from Settings when the app runs. This page lists them, so that nobody takes one for a mistake or replaces it with a real value.',
    '',
    '- **Stays invented**: an invented value. Do not replace it with a real one.',
    '- **Real, kept**: a real value that looks like a stand-in, kept on purpose.',
    '- **Ask the user**: not decided yet. A thread that meets it asks the user first ([agents/placeholders.md](agents/placeholders.md)).',
    '',
    '`node tools/placeholders.ts` shows where each one is (`--lines` for every line). `npm test` fails when a word or a shape of this list matches nothing, or when a placeholder that is not listed here appears.',
    '',
    '## Words',
    '',
    '| Id | Group | Stand-in | What it is | Use |',
    '|---|---|---|---|---|'
  ];
  for (const entry of registry.entries) lines.push(`| \`${entry.id}\` | ${cell(entry.group)} | ${entry.invented.map((word) => `\`${cell(word)}\``).join(', ')} | ${cell(entry.label)} | ${USE_WORDS[entry.use]} |`);
  lines.push('', '## Shapes', '', 'Whole families of stand-ins, as a regular expression.', '', '| Id | Group | Pattern | What it is | Use |', '|---|---|---|---|---|');
  for (const shape of registry.shapes) lines.push(`| \`${shape.id}\` | ${cell(shape.group)} | \`${cell(shape.pattern)}\` | ${cell(shape.label)} | ${USE_WORDS[shape.use]} |`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] === import.meta.filename) {
  const root = join(import.meta.dirname, '..');
  const registry = readRegistry(root);
  if (process.argv.includes('--doc')) {
    writeFileSync(join(root, PLACEHOLDERS_DOC), placeholdersDoc(registry));
    console.log(`${PLACEHOLDERS_DOC} written.`);
    process.exit(0);
  }
  const result = scan(root, registry);
  const withLines = process.argv.includes('--lines');
  for (const count of result.counts) {
    const files = new Set(count.hits.map((hit) => hit.file));
    console.log(`${count.id} (${USE_WORDS[count.use].toLowerCase()}): ${count.hits.length} lines in ${files.size} files. ${count.label}`);
    if (withLines) for (const hit of count.hits) console.log(`  ${hit.file}:${hit.line}: ${hit.text}`);
  }
  for (const id of result.ask) console.warn(`Ask the user about ${id} before you change it: see docs/agents/placeholders.md.`);
  const problems = scanProblems(result);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `Stand-ins: ${problems.length} problems.` : `Stand-ins: ${result.counts.length} entries and shapes, each found; no placeholder that is not listed.`);
  process.exit(problems.length ? 1 : 0);
}
