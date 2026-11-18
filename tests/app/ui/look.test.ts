import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The rules of the look (docs/LOOK.md), checked on the source of the screens (src/app):
 *   1. No text in capitals and no three dots in a text of the screens.
 *   2. No text under 12 px.
 *   3. No raw colour: a screen uses only the named colours of styles.css (the colours of Tailwind are switched off).
 *   4. No browser tooltip (`title`): the one tooltip of the page is `data-tip`.
 *   5. Every icon a screen names is in the icon set, and each text colour can be read on its backgrounds (4.5:1), light and dark.
 * The builds L2 to L5 of the new look emptied the list of places that still broke a rule (docs/LOOK.md, section 6): every
 * rule now holds everywhere, with no exception.
 */

const root = join(import.meta.dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const SCREENS = readdirSync(join(root, 'src/app'), { recursive: true, encoding: 'utf8' })
  .map((file) => `src/app/${file.replace(/\\/g, '/')}`).filter((file) => /\.(tsx?|html)$/.test(file)).sort();

/** The code without its comments, so a word in a comment is not taken for a text of the screen. */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');

const found = (pattern: RegExp, files = SCREENS): string[] => files.flatMap((file) => withoutComments(read(file)).split('\n')
  .map((line, at) => (pattern.test(line) ? `${file}:${at + 1}: ${line.trim().slice(0, 120)}` : '')).filter(Boolean));

test('rule 1: no text in capitals (no uppercase style, no letter spacing for capitals)', () => {
  assert.deepEqual(found(/\buppercase\b|text-transform|small-caps|\btracking-(wide|wider|widest)\b/), []);
});

test('rule 1: no three dots in a text of the screens (a spread "...list" is code, not text)', () => {
  assert.deepEqual(found(/…|\.\.\.(?![\w$([{.])/), []);
});

test('rule 2: no text under 12 px', () => {
  const small = found(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|text-\[0?\.[0-6]\d*rem\]|font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
  const css = read('src/app/styles.css');
  assert.deepEqual(small, []);
  assert.ok(!/font-size:\s*(?:[0-9]|1[01])px/.test(css), 'styles.css sets a text under 12 px');
});

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

test('rule 3: no raw colour in a screen: only the named colours of styles.css', () => {
  // A Tailwind colour with a shade (text-slate-500), white or black, a hex colour or rgb() in a screen.
  const raw = found(new RegExp(String.raw`(?:^|[\s'"\x60:])(?:bg|text|border|ring|divide|outline|decoration|placeholder|fill|stroke|from|to|via|shadow)-(?:(?:${PALETTE})-\d{2,3}|white|black)\b|#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(`),
    SCREENS.filter((file) => file !== 'src/app/index.html'));
  // The preview of an email shows the email as Outlook will: its own colours, not the look of the app.
  assert.deepEqual(raw.filter((line) => !/srcDoc=/.test(line)), []);
  // The tab icon of index.html cannot read the colours of the page: it uses the navy and coral of the tokens.
  const tab = read('src/app/index.html').match(/#[0-9a-fA-F]{3,6}\b|%23[0-9a-fA-F]{3,6}\b/g) ?? [];
  const tokens = read('src/app/styles.css').toLowerCase();
  assert.deepEqual(tab.map((hex) => hex.replace('%23', '#').toLowerCase()).filter((hex) => !tokens.includes(hex) && hex !== '#fff'), []);
});

test('rule 3: styles.css switches the colours of Tailwind off, and every named colour exists light and dark', () => {
  const css = read('src/app/styles.css');
  assert.match(css, /--color-\*:\s*initial;/);
  const light = tokensOf(css, ':root {'); const dark = tokensOf(css, ':root.dark {');
  assert.deepEqual(Object.keys(light).filter((name) => !(name in dark)), [], 'a colour has no dark value');
  for (const name of css.matchAll(/--color-[\w-]+:\s*var\(--wb-([\w-]+)\)/g)) assert.ok(name[1]! in light, `--wb-${name[1]} is not defined`);
});

test('rule 4: no browser tooltip: data-tip, not title, on the elements of a screen', () => {
  // `title` stays a property of the parts (a window's title, a heading); on an HTML element only the iframe keeps it (its name).
  assert.deepEqual(found(/<(?!iframe\b)[a-z][a-z0-9]*\b[^>]*\stitle=/), []);
});

test('rule 5: every icon a screen names is one of the icon set', () => {
  const icons = new Set([...read('src/app/ui/icons.ts').matchAll(/^ {2}(\w+): '/gm)].map((match) => match[1]!));
  assert.equal(icons.size, 73);
  const named = SCREENS.flatMap((file) => [...withoutComments(read(file)).matchAll(/(?:<Icon name=|icon=|icon: |iconName: )\{?'?"?([a-z]+)['"]/g)].map((match) => `${file}: ${match[1]}`));
  assert.ok(named.length > 100);
  assert.deepEqual(named.filter((entry) => !icons.has(entry.split(': ')[1]!)), []);
});

/* Cut texts (a CSS cut adds three dots): none. The list of L1 (13 places) was emptied by L2 to L5 (D214, D247). */
test('rule 1: no cut text (truncate, line-clamp, text-ellipsis)', () => {
  assert.deepEqual(found(/\b(truncate|line-clamp-\d|text-ellipsis)\b/), []);
});

/* Contrast (WCAG 2.1): every text colour on the backgrounds it is used on, light and dark. */
function tokensOf(css: string, block: string): Record<string, string> {
  const start = css.indexOf(block);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--wb-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [match[1]!, match[2]!.toLowerCase()]));
}
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string): number => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

test('rule 5: every text colour has a contrast of 4.5:1 or more on its backgrounds, light and dark', () => {
  const css = read('src/app/styles.css');
  const low: string[] = [];
  for (const [theme, colours] of [['light', tokensOf(css, ':root {')], ['dark', tokensOf(css, ':root.dark {')]] as const) {
    const pairs: Array<[string, string]> = [['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['tip-ink', 'tip'], ['ink', 'accent-soft'], ['ink', 'pink']];
    for (const text of ['ink', 'muted', 'accent', 'red', 'blue', 'teal', 'green', 'violet', 'amber', 'grey']) for (const back of ['page', 'surface', 'surface-2']) pairs.push([text, back]);
    for (const hue of ['red', 'blue', 'teal', 'green', 'violet', 'amber', 'grey']) pairs.push([hue, `${hue}-soft`], ['ink', `${hue}-soft`]);
    for (const [text, back] of pairs) {
      const value = ratio(colours[text]!, colours[back]!);
      if (value < 4.5) low.push(`${theme}: ${text} on ${back} is ${value.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(low, []);
});
