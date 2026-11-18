// The part SelfCheck of the table Run (D284), which the DAX table SelfCheck shows: per check, what the HTML app's logic
// finds on the samples (tests/recorded/cards.json, packed by the generator as ExpectedResult) and what this model finds
// on the newest report (§9.4 of the plan). A check matches when it is built and gives the same state, the same tested
// flag, the same CIs and the same finding keys in each state. The page shows it only for the sample data. `findings`
// and `testedPart` are the parts Findings and Tested already made, so the checks are not run again.
(findings as table, testedPart as table) as table =>
    let
        expected = Json.Document(ExpectedResult)[cards],
        words = ReadingRules[stateWords],
        built = Table.SelectRows(ChecksRows, each [Built])[CheckId],
        tested = List.Buffer(testedPart[CheckId]),
        sorted = (keys as list) as list => List.Sort(keys, Comparer.Ordinal),
        // The findings by check and state, grouped once (not selected again for each card and state).
        byCard = fnGroupBy(Table.ToRecords(findings), (finding) => finding[CheckId] & "|" & finding[State]),
        of = (id as text, state as text) as list => Record.FieldOrDefault(byCard, id & "|" & state, {}),
        keysOf = (id as text, state as text) as list => sorted(List.Transform(of(id, state), (finding) => finding[Key])),
        strip = (cases as list) as list => sorted(List.Transform(cases, (entry) => if Text.StartsWith(entry, "case ") then Text.Middle(entry, 5) else entry)),
        states = {"open", "review", "waiting", "known"},
        row = (card as record) as list =>
            let
                id = card[id],
                isBuilt = List.Contains(built, id),
                found = List.Buffer(List.Transform(states, (state) => List.Buffer(keysOf(id, state)))),
                want = List.Buffer(List.Transform(states, (state) => List.Buffer(strip(Record.Field(card, state))))),
                isTested = List.Contains(tested, id),
                shown = if not List.IsEmpty(found{0}) then "open" else "review",
                cis = List.Count(List.Distinct(List.Transform(of(id, shown), (finding) => finding[CiKey]))),
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
