import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, PatternError, testPattern } from '../../../tools/powerbi/regex.ts';
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
