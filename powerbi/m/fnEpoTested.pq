// What an EPO card tests (src/core/checks/detectors/epo-detectors.ts, testedFields): status and name always, each role of
// reference/epo-systems-report whose user ID column the CI report has, and the description when it has that column, each
// on the pairs of the card. The notes of the comparison (what it could not compare) are the card's notes too.
(pack as record, run as record, config as record, pairs as list) as record =>
    let
        columns = run[Columns],
        fields = {"status", "name"} & List.Transform(config[roles], (entry) => entry[role]) & {"description"},
        kept = List.Select(fields, (field) =>
            if field = "description" then List.Contains(columns, "description")
            else field = "status" or field = "name" or List.Contains(columns, field & ".userId"))
    in
        [
            Tested = List.Transform(kept, (field) => pack[id] & ":" & field),
            Evaluated = List.Transform(kept, (field) => [Part = pack[id] & ":" & field, Count = List.Count(pairs)]),
            Notes = run[EpoComparison][Notes]
        ]
