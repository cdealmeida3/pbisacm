// The columns of a CI report by the names the checks use (src/core/sources/ci/ci-report.ts, `columns`): "supportGroup",
// "owned_by.active", "target.confidentiality". A check never reports on data the report does not carry.
(read as record) as list =>
    let
        specs = ReadingRules[ciColumns],
        found = fnPickColumns(read, specs)[Found]
    in
        List.Transform(List.Select(specs, (spec) => List.Contains(found, spec[column])), (spec) => spec[field])
