// Does the text match the pattern (a regular expression of a check file or a reference file)? `flags` is "i" to ignore
// case, else "". The pattern must be one the generator compiled (the query Patterns): an unknown one stops the refresh
// with its name, so a check never passes silently on a pattern Power Query does not know.
(pattern as text, flags as text, value as text) as logical =>
    let
        key = flags & "/" & pattern,
        tree = Record.FieldOrDefault(Patterns, key, null)
    in
        if tree = null then error Error.Record("SACM.Pattern", "The pattern /" & pattern & "/" & flags & " is not compiled. Run npm run powerbi:generate.")
        else fnRegexTest(tree, value)
