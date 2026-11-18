// Does a compiled pattern (the query Patterns, tools/powerbi/regex.ts) match somewhere in the text? As RegExp.test of
// JavaScript: the walk of fnRegexWalk from every place in the text.
(tree as list, value as text) as logical =>
    not List.IsEmpty(fnRegexWalk(tree, value, List.Numbers(0, Text.Length(value) + 1)))
