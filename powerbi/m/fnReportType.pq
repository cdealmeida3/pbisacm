// The type of a report from its header row: the type whose needed columns are all there; the one with the most needed
// columns wins when two fit (src/core/reading/table.ts, recogniseAmong). No type: Kind is "" and Message says what each
// type is missing.
(headers as list) as record =>
    let
        types = ReadingRules[reportTypes],
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
        else [Kind = "", Label = "Not read", Message = "This file is not a report the Workbench knows: " & Text.Combine(parts, "; ") & "."]
