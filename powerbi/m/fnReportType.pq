// The type of a report from its header row: the type whose needed columns are all there; the one with the most needed
// columns wins when two fit (src/core/reading/table.ts, recogniseAmong). No report type: a file the Workbench knows but
// does not use (ReadingRules[knownFiles]: a CMDB Health result, the contract–CI links, D341, D342) has its kind and its
// words; any other file has the Kind "unknown" and a Message that says what each type is missing. Never "": a blank kind
// would add a blank row to ReportTypes (D349).
(headers as list) as record =>
    let
        types = ReadingRules[reportTypes],
        knownFits = List.Select(ReadingRules[knownFiles], (candidate) =>
            List.AllTrue(List.Transform(candidate[needs], (need) => List.ContainsAny(headers, need[any])))),
        known = List.First(knownFits, null),
        missingOf = (candidate as record) as list =>
            List.Transform(List.Select(candidate[needs], (need) => not List.ContainsAny(headers, need[any])), (need) => need[label]),
        withMissing = List.Transform(types, (candidate) => candidate & [missing = missingOf(candidate)]),
        fitting = List.Select(withMissing, (candidate) => List.IsEmpty(candidate[missing])),
        most = List.Max(List.Transform(fitting, (candidate) => List.Count(candidate[needs])), 0),
        best = List.First(List.Select(fitting, (candidate) => List.Count(candidate[needs]) = most), null),
        parts = List.Transform(withMissing, (candidate) =>
            "a " & candidate[label] & " needs " & Text.Combine(List.Transform(candidate[needs], (need) => need[label]), ", ")
            & " (missing: " & Text.Combine(candidate[missing], ", ") & ")")
    in
        if best <> null then [Kind = best[kind], Label = best[label], Message = ""]
        else if known <> null then [Kind = known[kind], Label = known[label], Message = known[why]]
        else [Kind = "unknown", Label = "Not a report", Message = "This file is not a report the Workbench knows: " & Text.Combine(parts, "; ") & "."]
