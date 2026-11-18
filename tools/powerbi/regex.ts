// The regular expressions of the check files and the reference files, for Power Query. M has no regular expressions, so
// the generator compiles each pattern into a small tree (packed as the query Patterns) and the M function fnRegexTest
// walks it: the set of places in the text that the pattern can reach, one part after the other. Only the forms the
// checks use are known (plan §4.4): literal characters, ".", classes [...], \d \w \s and their capitals, \b \B, ^ $,
// groups (...) and (?:...), "|", and the counts ? * + {n} {n,} {n,m}. Anything else (look-ahead, back references, named
// groups) is refused here, so npm run powerbi:generate and the lint fail before a check can silently pass.
//
// Same meaning as JavaScript without the flags "m", "s", "u" and "y". Flag "i" is applied here: each letter of the
// pattern is given its other case, so the M side never needs to know the flag.
//
// The tree, as JSON arrays (short, because it is packed into the model):
//   ["c", [from, to, from, to, ...], negated]   one character whose code is in one of the ranges (negated: in none)
//   ["s", [part, ...]]                          the parts one after the other
//   ["a", [part, ...]]                          one of the parts
//   ["r", min, max, part]                       the part min to max times (max -1: no limit)
//   ["^"] ["$"] ["b"] ["B"]                     start, end, word boundary, not a word boundary

export type Node = ['c', number[], 0 | 1] | ['s', Node[]] | ['a', Node[]] | ['r', number, number, Node] | ['^'] | ['$'] | ['b'] | ['B'];

const DIGIT = [48, 57];
const WORD = [48, 57, 65, 90, 95, 95, 97, 122];
// JavaScript's \s: tab to carriage return, space, no-break space, the Unicode spaces, line and paragraph separators, BOM.
const SPACE = [9, 13, 32, 32, 160, 160, 5760, 5760, 8192, 8202, 8232, 8233, 8239, 8239, 8287, 8287, 12288, 12288, 65279, 65279];
// "." is any character but the line ends.
const LINE_ENDS = [10, 10, 13, 13, 8232, 8233];

export class PatternError extends Error {}

/** The ranges with the other case of every letter in them added (flag "i"), for the letters that have one character in each case. */
function withCases(ranges: number[]): number[] {
  const out = ranges.slice();
  for (let i = 0; i < ranges.length; i += 2) {
    const [from, to] = [ranges[i]!, ranges[i + 1]!];
    if (to - from > 2000) continue;
    for (let code = from; code <= to; code++) {
      const char = String.fromCharCode(code);
      for (const other of [char.toLowerCase(), char.toUpperCase()]) {
        if (other.length === 1 && other !== char) out.push(other.charCodeAt(0), other.charCodeAt(0));
      }
    }
  }
  return normalise(out);
}

/** Ranges sorted and joined, so the same class gives the same bytes. */
function normalise(ranges: number[]): number[] {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < ranges.length; i += 2) pairs.push([ranges[i]!, ranges[i + 1]!]);
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const pair of pairs) {
    const last = out[out.length - 1];
    if (last && pair[0] <= last[1] + 1) last[1] = Math.max(last[1], pair[1]);
    else out.push([pair[0], pair[1]]);
  }
  return out.flat();
}

const complement = (ranges: number[]): number[] => {
  const out: number[] = [];
  let next = 0;
  const sorted = normalise(ranges);
  for (let i = 0; i < sorted.length; i += 2) {
    if (sorted[i]! > next) out.push(next, sorted[i]! - 1);
    next = sorted[i + 1]! + 1;
  }
  if (next <= 0xffff) out.push(next, 0xffff);
  return out;
};

/** Compiles a JavaScript pattern into the tree. `flags` may hold "i" (and "g", which a test ignores); any other flag is refused. */
export function compilePattern(source: string, flags = ''): Node {
  for (const flag of flags) if (flag !== 'i' && flag !== 'g') throw new PatternError(`/${source}/${flags}: the flag "${flag}" is not known to Power Query (tools/powerbi/regex.ts)`);
  const caseless = flags.includes('i');
  let at = 0;
  const fail = (why: string): never => { throw new PatternError(`/${source}/: ${why} at position ${at} (Power Query knows only the forms of tools/powerbi/regex.ts)`); };
  const set = (ranges: number[], negated = false): Node => ['c', caseless ? withCases(normalise(ranges)) : normalise(ranges), negated ? 1 : 0];

  /** An escape after "\": a class (\d …) as ranges with its negation, or one character. */
  const escape = (inClass: boolean): { ranges: number[]; negated: boolean } | { assertion: 'b' | 'B' } => {
    const char = source[at++];
    if (char === undefined) return fail('a pattern ends with "\\"');
    if (char === 'd' || char === 'D') return { ranges: DIGIT, negated: char === 'D' };
    if (char === 'w' || char === 'W') return { ranges: WORD, negated: char === 'W' };
    if (char === 's' || char === 'S') return { ranges: SPACE, negated: char === 'S' };
    if (char === 'b' && !inClass) return { assertion: 'b' };
    if (char === 'B' && !inClass) return { assertion: 'B' };
    if (char === 't') return { ranges: [9, 9], negated: false };
    if (char === 'n') return { ranges: [10, 10], negated: false };
    if (char === 'r') return { ranges: [13, 13], negated: false };
    if (char === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(at, at + 4))) { const code = parseInt(source.slice(at, at + 4), 16); at += 4; return { ranges: [code, code], negated: false }; }
    if (char === 'x' && /^[0-9a-fA-F]{2}$/.test(source.slice(at, at + 2))) { const code = parseInt(source.slice(at, at + 2), 16); at += 2; return { ranges: [code, code], negated: false }; }
    if (/[\\^$.|?*+()[\]{}/\- ]/.test(char)) return { ranges: [char.charCodeAt(0), char.charCodeAt(0)], negated: false };
    return fail(`the escape "\\${char}" is not known`);
  };

  const charClass = (): Node => {
    const negated = source[at] === '^';
    if (negated) at += 1;
    const ranges: number[] = [];
    let first = true;
    while (at < source.length && (source[at] !== ']' || first)) {
      first = false;
      let from: number;
      if (source[at] === '\\') {
        at += 1;
        const found = escape(true);
        if ('assertion' in found) return fail('an assertion inside a class');
        if (found.negated || found.ranges.length > 2 || found.ranges[0] !== found.ranges[1]) { ranges.push(...(found.negated ? complement(found.ranges) : found.ranges)); continue; }
        from = found.ranges[0]!;
      } else {
        from = source.charCodeAt(at++);
      }
      if (source[at] === '-' && source[at + 1] !== undefined && source[at + 1] !== ']') {
        at += 1;
        let to: number;
        if (source[at] === '\\') {
          at += 1;
          const found = escape(true);
          if ('assertion' in found || found.negated || found.ranges.length > 2 || found.ranges[0] !== found.ranges[1]) return fail('a range that ends with a class');
          to = found.ranges[0]!;
        } else to = source.charCodeAt(at++);
        if (to < from) fail('a range in the wrong order');
        ranges.push(from, to);
      } else ranges.push(from, from);
    }
    if (source[at] !== ']') fail('a class without "]"');
    at += 1;
    return set(ranges, negated);
  };

  const atom = (): Node => {
    const char = source[at]!;
    if (char === '(') {
      at += 1;
      if (source[at] === '?') {
        if (source[at + 1] !== ':') fail('a group of the form (?…) other than (?:…)');
        at += 2;
      }
      const inner = alternation();
      if (source[at] !== ')') fail('a group without ")"');
      at += 1;
      return inner;
    }
    if (char === '[') { at += 1; return charClass(); }
    if (char === '.') { at += 1; return ['c', complement(LINE_ENDS), 0]; }
    if (char === '^') { at += 1; return ['^']; }
    if (char === '$') { at += 1; return ['$']; }
    if (char === '\\') {
      at += 1;
      const found = escape(false);
      if ('assertion' in found) return [found.assertion];
      return found.negated ? set(complement(found.ranges)) : set(found.ranges);
    }
    if (/[*+?{]/.test(char) && !(char === '{' && !/^\{\d+(,\d*)?\}/.test(source.slice(at)))) fail(`"${char}" with nothing before it`);
    if (char === ')' || char === '|') fail(`"${char}" where it is not expected`);
    at += 1;
    return set([char.charCodeAt(0), char.charCodeAt(0)]);
  };

  const quantified = (): Node => {
    let node = atom();
    for (;;) {
      const char = source[at];
      let min: number; let max: number;
      if (char === '?') { min = 0; max = 1; at += 1; }
      else if (char === '*') { min = 0; max = -1; at += 1; }
      else if (char === '+') { min = 1; max = -1; at += 1; }
      else if (char === '{' && /^\{\d+(,\d*)?\}/.test(source.slice(at))) {
        const found = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(at))!;
        min = Number(found[1]); max = found[2] === undefined ? min : found[3] === '' ? -1 : Number(found[3]);
        if (max >= 0 && max < min) fail('a count {n,m} with m below n');
        at += found[0].length;
      } else return node;
      // A lazy count ("+?") finds the same matches when only a yes or no is asked.
      if (source[at] === '?') at += 1;
      if (node[0] === '^' || node[0] === '$' || node[0] === 'b' || node[0] === 'B') fail('a count after an assertion');
      node = ['r', min, max, node];
    }
  };

  const sequence = (): Node => {
    const parts: Node[] = [];
    while (at < source.length && source[at] !== '|' && source[at] !== ')') parts.push(quantified());
    return parts.length === 1 ? parts[0]! : ['s', parts];
  };

  function alternation(): Node {
    const options = [sequence()];
    while (source[at] === '|') { at += 1; options.push(sequence()); }
    return options.length === 1 ? options[0]! : ['a', options];
  }

  const tree = alternation();
  if (at < source.length) fail(`"${source[at]}" where it is not expected`);
  return tree;
}

/* ------------------------------------------------------------------ the same walk as fnRegexTest, for the tests */

const isWord = (code: number | undefined): boolean => code !== undefined && ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || code === 95 || (code >= 97 && code <= 122));
const inRanges = (ranges: number[], code: number): boolean => { for (let i = 0; i < ranges.length; i += 2) if (code >= ranges[i]! && code <= ranges[i + 1]!) return true; return false; };

/** The places a part can reach from the places `from`, in a text of character codes. The M function does the same. */
function step(node: Node, from: number[], codes: number[]): number[] {
  const unique = (list: number[]): number[] => Array.from(new Set(list)).sort((a, b) => a - b);
  switch (node[0]) {
    case 'c': return unique(from.filter((at) => at < codes.length && inRanges(node[1], codes[at]!) !== (node[2] === 1)).map((at) => at + 1));
    case 's': return node[1].reduce((places, part) => (places.length ? step(part, places, codes) : places), from);
    case 'a': return unique(node[1].flatMap((part) => step(part, from, codes)));
    case '^': return from.filter((at) => at === 0);
    case '$': return from.filter((at) => at === codes.length);
    case 'b': return from.filter((at) => isWord(codes[at - 1]) !== isWord(codes[at]));
    case 'B': return from.filter((at) => isWord(codes[at - 1]) === isWord(codes[at]));
    case 'r': {
      const [, min, max, part] = node;
      let places = from;
      for (let i = 0; i < min && places.length; i++) places = step(part, places, codes);
      let all = places;
      let frontier = places;
      for (let i = min; (max < 0 || i < max) && frontier.length; i++) {
        const next = step(part, frontier, codes).filter((at) => !all.includes(at));
        all = unique(all.concat(next));
        frontier = next;
      }
      return all;
    }
  }
}

/** Does the pattern match somewhere in the text? As RegExp.prototype.test. */
export function testPattern(node: Node, text: string): boolean {
  const codes = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  return step(node, Array.from({ length: codes.length + 1 }, (_, index) => index), codes).length > 0;
}
