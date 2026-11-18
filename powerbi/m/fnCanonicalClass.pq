// A class as label or table name, as its class id ("Application Service" and cmdb_ci_service_auto are service_instance).
// Anything else keeps its own name in lower case with "_" for spaces (src/core/sources/ci/ci-report.ts, canonicalClass).
(value as text) as text =>
    let
        text = Text.Lower(Text.Trim(value), "en-US"),
        aliases = ReadingRules[classAliases],
        found = List.Select(Record.FieldNames(aliases), (id) => List.Contains(Record.Field(aliases, id), text))
    in
        if List.IsEmpty(found) then Text.Combine(List.Select(Text.SplitAny(text, " #(tab)#(cr)#(lf)"), each _ <> ""), "_") else found{0}
