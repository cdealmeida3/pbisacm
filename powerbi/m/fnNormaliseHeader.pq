// A report header as the checks compare it: trimmed, lower case, spaces as "_" (src/core/reading/headers.ts). The "ci."
// prefix is kept: it is the mark of a CMDB Health result, never the CI report (D341).
(header as text) as text =>
    let
        lower = Text.Lower(Text.Trim(header), "en-US"),
        joined = Text.Combine(List.Select(Text.SplitAny(lower, " #(tab)#(cr)#(lf)#(00A0)"), each _ <> ""), "_")
    in
        joined
