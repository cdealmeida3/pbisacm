// The text with every run of two or more spaces as one space (the fix of a name with two spaces in a row).
(value as text) as text =>
    let
        parts = Text.Split(value, " "),
        // A run of n spaces gives n - 1 empty parts between two words; keep one space for each run.
        kept = List.Accumulate(List.Positions(parts), {}, (out, at) => if at > 0 and parts{at} = "" and at < List.Count(parts) - 1 then out else out & {parts{at}})
    in
        Text.Combine(kept, " ")
