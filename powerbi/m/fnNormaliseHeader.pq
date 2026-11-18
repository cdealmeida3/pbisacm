// A report header as the checks compare it: trimmed, lower case, spaces as "_", the "ci." prefix of a CMDB Health
// result removed (src/core/reading/headers.ts).
(header as text) as text =>
    let
        lower = Text.Lower(Text.Trim(header), "en-US"),
        joined = Text.Combine(List.Select(Text.SplitAny(lower, " #(tab)#(cr)#(lf)#(00A0)"), each _ <> ""), "_")
    in
        if Text.StartsWith(joined, "ci.") then Text.Middle(joined, 3) else joined
