// Where a pattern (a regular expression of a check file or a reference file, compiled into the query Patterns) first
// matches in the text, as String.search of JavaScript: [Index, End], Index -1 when it does not match. End is the
// furthest place the match can reach from Index: the end of the match of JavaScript for the patterns that end with "$",
// the only ones read for their end (fnEnvironment, the name of a Business Application). An unknown pattern stops the
// refresh with its name, as fnMatches does.
(pattern as text, flags as text, value as text) as record =>
    let
        key = flags & "/" & pattern,
        tree = Record.FieldOrDefault(Patterns, key, null),
        ends = (at as number) as list => fnRegexWalk(tree, value, {at}),
        index = if not fnRegexTest(tree, value) then -1
            else List.First(List.Select(List.Numbers(0, Text.Length(value) + 1), (at) => not List.IsEmpty(ends(at))), -1)
    in
        if tree = null then error Error.Record("SACM.Pattern", "The pattern /" & pattern & "/" & flags & " is not compiled. Run npm run powerbi:generate.")
        else [Index = index, End = if index < 0 then -1 else List.Max(ends(index))]
