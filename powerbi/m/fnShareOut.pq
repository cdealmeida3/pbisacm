// Share out (D24, build B7; src/core/team/team.ts, shareOut): the manager each free group of a card goes to, as a record
// case key → name. A group is the cases of one check that go to one person by one route, to solve (groupCases); it is
// free when none of its open cases is assigned. On a SACM fix list a group is a record (a CI), sized by its lines. The groups of each card go out together: the biggest first (by its open
// CIs, then by its key), each to the active member of the list SACM Team with the fewest CIs so far (the first of the list
// when equal). Fewer than two active members: nobody (the Power App says to add colleagues first). `lines`: the cases of
// fnCases, before this column.
(lines as list) as record =>
    let
        rows = Table.ToRecords(fnStateList("team")),
        members = List.Buffer(List.Transform(List.Select(rows, (row) => not List.Contains({"no", "false", "0"}, Text.Lower(Text.Trim(row[Active]), "en-US"))), (row) => row[Title])),
        compare = Comparer.FromCulture("en-US"),
        open = List.Select(lines, (item) => item[InLatest] and item[State] = "open"),
        contactOf = (fact as record) as text =>
            if fact[ContactId] <> "" then fact[ContactId] else if Text.Lower(fact[ContactEmail], "en-US") <> "" then Text.Lower(fact[ContactEmail], "en-US") else "nobody",
        byCard = fnGroupBy(open, (item) => item[CheckId]),
        card = (items as list) as list =>
            let
                book = Record.FieldOrDefault(CheckPlaybooks, items{0}[CheckId], [Kind = "", AskWhenUnsure = ""]),
                // A SACM fix list (FixListCard, ShareRecords): its records (one CI each) that SACM fixes itself, by their
                // lines still to mark; free when no line not closed has anybody. Without such lines: the lines
                // handed to the owner, by group, as on an owners card.
                fixOnes = if book[Kind] = "fix" then List.Select(items, (item) => not (book[AskWhenUnsure] <> "" and item[Askable])) else {},
                records = List.Transform(Record.FieldValues(fnGroupBy(fixOnes, (item) => item[CiKey])), (rows) =>
                    let
                        live = List.Select(rows, (item) => not item[Closed]),
                        toMark = List.Select(live, (item) => item[Status] <> "Fixed")
                    in
                        [Key = rows{0}[CiKey], Open = toMark, Size = List.Count(toMark), Taken = List.AnyTrue(List.Transform(live, (item) => item[AssignedTo] <> ""))]),
                owned = if book[Kind] = "fix" then List.Select(items, (item) => item[Askable]) else items,
                groups = Record.FieldValues(fnGroupBy(owned, (item) => item[CheckId] & "|" & item[Fact][Route] & "|" & contactOf(item[Fact]))),
                keyed = List.Transform(groups, (rows) =>
                    let fact = rows{0}[Fact], openOnes = List.Select(rows, (item) => not item[Closed]) in
                    [Key = fact[CheckId] & "|" & fact[Route] & "|" & contactOf(fact), Open = openOnes, Size = List.Count(List.Distinct(List.Transform(openOnes, (item) => item[CiKey]))),
                        Taken = List.AnyTrue(List.Transform(openOnes, (item) => item[AssignedTo] <> ""))]),
                free = List.Select(if List.IsEmpty(fixOnes) then keyed else records, (group) => not List.IsEmpty(group[Open]) and not group[Taken]),
                ordered = List.Buffer(List.Sort(free, (a, b) => let bySize = Value.Compare(b[Size], a[Size]) in if bySize <> 0 then bySize else compare(a[Key], b[Key]))),
                count = List.Count(ordered),
                // Each group to the member with the least so far: one step per group, carrying the CIs of each member
                // (Load) and giving the name (no list grows step by step, which is slow in M).
                names = if count = 0 then {} else List.Buffer(List.Skip(List.Generate(
                    () => [At = -1, Load = List.Repeat({0}, List.Count(members)), Name = ""],
                    (step) => step[At] < count,
                    (step) =>
                        let
                            at = step[At] + 1,
                            load = step[Load],
                            best = List.PositionOf(load, List.Min(load))
                        in
                            if at >= count then [At = at, Load = load, Name = ""]
                            else [At = at, Load = List.Buffer(List.ReplaceRange(load, best, 1, {load{best} + ordered{at}[Size]})), Name = members{best}],
                    (step) => step[Name])))
            in
                List.Combine(List.Transform(List.Positions(ordered), (at) => List.Transform(ordered{at}[Open], (item) => {item[Key], names{at}}))),
        pairs = if List.Count(members) < 2 then {} else List.Combine(List.Transform(Record.FieldValues(byCard), card))
    in
        Record.FromList(List.Transform(pairs, (pair) => pair{1}), List.Transform(pairs, (pair) => pair{0}))
