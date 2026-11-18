// Table SelfCheck: per check, what the HTML app's logic finds on the samples (tests/recorded/cards.json, packed by the
// generator as ExpectedResult) and what this model finds on the newest report (§9.4 of the plan). A check matches when it
// is built and gives the same state, the same tested flag, the same CIs and the same finding keys in each state. The page
// shows it only for the sample data.
let
    expected = Json.Document(ExpectedResult)[cards],
    words = ReadingRules[stateWords],
    built = Table.SelectRows(ChecksRows, each [Built])[CheckId],
    findings = Table.Buffer(FindingsRows),
    tested = List.Buffer(TestedRows[CheckId]),
    sorted = (keys as list) as list => List.Sort(keys, Comparer.Ordinal),
    keysOf = (id as text, state as text) as list => sorted(Table.SelectRows(findings, each [CheckId] = id and [State] = state)[Key]),
    strip = (cases as list) as list => sorted(List.Transform(cases, (entry) => if Text.StartsWith(entry, "case ") then Text.Middle(entry, 5) else entry)),
    states = {"open", "review", "waiting", "known"},
    row = (card as record) as list =>
        let
            id = card[id],
            isBuilt = List.Contains(built, id),
            found = List.Transform(states, (state) => keysOf(id, state)),
            want = List.Transform(states, (state) => strip(Record.Field(card, state))),
            isTested = List.Contains(tested, id),
            shown = if not List.IsEmpty(found{0}) then "open" else "review",
            cis = List.Count(List.Distinct(Table.SelectRows(findings, each [CheckId] = id and [State] = shown)[CiKey])),
            light = if not isTested then "grey" else if not List.IsEmpty(found{0}) then "red" else if not List.IsEmpty(found{1}) then "review" else "green",
            differ = List.Select(List.Positions(states), (position) => found{position} <> want{position}),
            keyWhy = List.Transform(differ, (position) =>
                let
                    missing = List.Difference(want{position}, found{position}),
                    extra = List.Difference(found{position}, want{position}),
                    show = (keys as list) as text => Text.Combine(List.FirstN(keys, 3), ", ") & (if List.Count(keys) > 3 then " and " & Text.From(List.Count(keys) - 3) & " more" else "")
                in
                    {"To solve", "To check", "Waiting", "Known"}{position} & ": "
                        & Text.Combine(List.Select({if List.IsEmpty(missing) then "" else "missing " & show(missing), if List.IsEmpty(extra) then "" else "not expected " & show(extra)}, (text) => text <> ""), "; ")),
            why = List.Select({
                if light <> card[light] then "Expected " & Record.FieldOrDefault(words, card[light], card[light]) & ", found " & Record.FieldOrDefault(words, light, light) & "." else "",
                if isTested <> card[tested] then (if card[tested] then "Expected tested, found not tested." else "Expected not tested, found tested.") else "",
                if cis <> card[cis] then "Expected " & Text.From(card[cis]) & " CIs, found " & Text.From(cis) & "." else ""
            } & List.Transform(keyWhy, (text) => text & "."), (text) => text <> ""),
            match = isBuilt and List.IsEmpty(why)
        in
            {
                id, Record.FieldOrDefault(words, card[light], card[light]), card[tested],
                List.Count(want{0}), List.Count(want{1}), List.Count(want{2}), List.Count(want{3}), card[cis],
                if isBuilt then "Built" else "Not built",
                if isBuilt then Record.FieldOrDefault(words, light, light) else "", isBuilt and isTested,
                if isBuilt then List.Count(found{0}) else 0, if isBuilt then List.Count(found{1}) else 0,
                if isBuilt then List.Count(found{2}) else 0, if isBuilt then List.Count(found{3}) else 0, if isBuilt then cis else 0,
                match,
                if not isBuilt then "The check is not built in the Power BI version yet." else if match then "Same result." else Text.Combine(why, " ")
            }
in
    #table(
        type table [CheckId = text, ExpectedState = text, ExpectedTested = logical, ExpectedToSolve = Int64.Type, ExpectedToCheck = Int64.Type,
            ExpectedWaiting = Int64.Type, ExpectedKnown = Int64.Type, ExpectedCis = Int64.Type, Found = text, FoundState = text, FoundTested = logical,
            FoundToSolve = Int64.Type, FoundToCheck = Int64.Type, FoundWaiting = Int64.Type, FoundKnown = Int64.Type, FoundCis = Int64.Type,
            Match = logical, Why = text],
        List.Transform(expected, row))
