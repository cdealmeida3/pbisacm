import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compilePattern, fastForm, fastTest, PatternError, testPattern } from '../../../tools/powerbi/regex.ts';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { compiledPatterns, patternUses } from '../../../tools/powerbi/generate.ts';

/*
 * The regular expressions for Power Query (tools/powerbi/regex.ts): M has none, so the generator compiles each pattern of
 * the check files and the reference files into a tree, and fnRegexTest walks it. testPattern does the same walk here, so
 * the tree is checked against JavaScript; the Windows job checks fnRegexTest against JavaScript too (tools/powerbi/units.ts).
 */

const TEXTS = ['', 'a', 'A', 'ab', 'abc', 'aab', 'abab', 'Member Engine - PROD', 'member engine - prod', 'Index - TEST', 'Index-PROD', ' x', 'x ', 'a  b',
  'TBD', 'n/a', '-', '...', 'test', '(Auto generated)', 'AST-0001', 'AST-001', 'owned_by', 'owned_by.email', 'supportGroup', 'x​y', 'é', '12', '123', 'a1_b'];

test('every pattern of the checks gives the answer of JavaScript on every text', () => {
  for (const use of patternUses()) {
    const tree = compilePattern(use.source, use.flags);
    const pattern = new RegExp(use.source, use.flags.replace('g', ''));
    for (const text of TEXTS) assert.equal(testPattern(tree, text), pattern.test(text), `/${use.source}/${use.flags} on ${JSON.stringify(text)} (${use.where})`);
  }
});

test('the known forms match as in JavaScript: classes, counts, groups, anchors, word boundaries, flag i', () => {
  const forms = ['^a', 'b$', '^ab+c?$', 'a{2}', 'a{1,}b', '^(ab){2}$', '(?:a|b)c', '[^a-c]', '[\\d_]', '\\w+\\s\\w', '\\bab\\b', '\\Bb', '^.$', 'a.*?b', '\\.', '\\(', '[.-]', '^$', 'x\\u200by'];
  for (const source of forms) {
    for (const flags of ['', 'i']) {
      const tree = compilePattern(source, flags);
      const pattern = new RegExp(source, flags);
      for (const text of TEXTS) assert.equal(testPattern(tree, text), pattern.test(text), `/${source}/${flags} on ${JSON.stringify(text)}`);
    }
  }
});

test('a form Power Query does not know is refused, so a check never passes silently', () => {
  for (const source of ['(?=a)', '(?!a)', '(?<=a)', '(?<name>a)', '(a)\\1', '\\p{L}', '*a', 'a{2,1}', '(a', '[a']) {
    assert.throws(() => compilePattern(source), PatternError, source);
  }
  assert.throws(() => compilePattern('a', 'm'), PatternError);
  assert.throws(() => compilePattern('a', 'u'), PatternError);
});

test('the same patterns give the same bytes', () => {
  assert.equal(JSON.stringify(compiledPatterns()), JSON.stringify(compiledPatterns()));
  assert.deepEqual(compilePattern('[b-ca]'), compilePattern('[a-c]'));
});

/*
 * The fast forms (D285): most texts are decided without the walk. On a corpus (every cell of the samples, the words of
 * each pattern, each word with one character changed, both cases, spaces around, the empty text, non-ASCII letters, the
 * Kelvin sign, a zero-width space), the fast form must agree with JavaScript whenever it decides, and the walk always.
 */

function corpus(): string[] {
  const folder = join(import.meta.dirname, '..', '..', '..', 'samples');
  const out = new Set<string>(TEXTS);
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.csv'))) {
    for (const row of parseCsv(readFileSync(join(folder, file), 'utf8'))) for (const cell of row) out.add(cell);
  }
  for (const use of patternUses()) {
    const form = fastForm(use.source, use.flags);
    for (const word of [...(form.Words ?? []), ...(form.Starts ?? []), ...(form.Ends ?? [])]) {
      const variants = [word, word.toUpperCase(), ` ${word} `, `x${word}`, `${word}x`, `${word}${word}`, word.replace(/k/g, 'K'), `${word}​`];
      for (let at = 0; at < word.length; at++) variants.push(word.slice(0, at) + 'q' + word.slice(at + 1), word.slice(0, at) + word.slice(at + 1));
      variants.forEach((text) => out.add(text));
    }
  }
  ['', ' ', 'é', 'É', 'Æble Grød', 'K', 'kelvin K', 'ok', 'x​y', 'abc', 'ABC', 'aB3', 'ab_cd.Ef', 'ab cd', '---', '-.?x', 'X', '?', ' BA'].forEach((text) => out.add(text));
  return [...out];
}

test('the fast form of every pattern gives the answer of JavaScript whenever it decides, on a corpus', () => {
  const texts = corpus();
  let decided = 0;
  for (const use of patternUses()) {
    const form = fastForm(use.source, use.flags);
    const tree = compilePattern(use.source, use.flags);
    const pattern = new RegExp(use.source, use.flags.replace('g', ''));
    for (const text of texts) {
      const want = pattern.test(text);
      const fast = fastTest(form, text);
      if (fast !== null) { decided += 1; assert.equal(fast, want, `fast form ${form.Kind} of /${use.source}/${use.flags} on ${JSON.stringify(text)}`); }
      assert.equal(testPattern(tree, text), want, `walk of /${use.source}/${use.flags} on ${JSON.stringify(text)}`);
    }
  }
  assert.ok(decided > texts.length * patternUses().length * 0.8, `the fast forms decide most texts (${decided})`);
});

test('the fast forms: words for whole texts, starts, ends and contains; only these characters; a quick "no"', () => {
  assert.deepEqual(fastForm('^(test|tst)$', 'i'), { Kind: 'exact', Lower: true, Words: ['test', 'tst'] });
  assert.deepEqual(fastForm('^n/?a$', 'i').Words, ['n/a', 'na']);
  assert.deepEqual(fastForm('^API - ', ''), { Kind: 'prefix', Lower: false, Words: ['API - '] });
  assert.deepEqual(fastForm(' - (PROD|TEST)$', '').Words, [' - PROD', ' - TEST']);
  assert.equal(fastForm('to be deleted', 'i').Kind, 'contains');
  assert.deepEqual({ ...fastForm('^[A-Za-z0-9]{3}$', ''), Chars: undefined }, { Kind: 'only', Lower: false, Min: 3, Max: 3, Chars: undefined });
  assert.equal(fastForm('^[a-z]+(_[a-z]+)*(\\.[a-zA-Z]+)*$', '').Allowed?.length, 54);
  assert.deepEqual(fastForm('^API\\b', '').Starts, ['API']);
  assert.deepEqual(fastForm('\\s+-\\s+(PROD|TEST)$', '').Ends, ['PROD', 'TEST']);
  // Lower case only for ASCII text: the Kelvin sign is left to the walk.
  assert.equal(fastTest(fastForm('^ok$', 'i'), 'K'), null);
  assert.equal(fastTest(fastForm('^ok$', 'i'), 'OK'), true);
});
