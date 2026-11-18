// Table ContractChanges: the page Contract changes (src/core/sources/contracts/contract-changes.ts, contractChanges and
// contractInformation). The newest Solusi contract file against the one before it: new contracts, contracts no longer in
// the file, status changes and every changed field (the lines of its export), then the Concluded contracts of the active
// tab with an end date on or after the date of the file (DaysLeft: days from that date; the page counts the days from
// today, so the next 30 and 90 days are right on any day), then the running contracts with no daily responsible. For
// information only: nobody is asked, no case is opened. Its own small query: it does not read the checks (D284).
let
    config = fnReference("reference/contract-reports"),
    words = ContractWords,
    files = Table.Buffer(Table.Sort(Table.SelectRows(ReadFiles, each [Kind] = "solusi" and [ReportDate] <> null), {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}})),
    count = Table.RowCount(files),
    fileAt = (at as number) as record => let row = files{at} in [Date = row[ReportDate], Contracts = List.Buffer(Table.ToRecords(fnReadKind("solusi", row[Read])))],
    current = if count = 0 then null else fileAt(count - 1),
    previous = if count < 2 then null else fileAt(count - 2),
    lower = (value as text) as text => Text.Lower(value, "en-US"),
    shown = (value as any) as text => if words[Blank](value) then "empty" else words[Shown](value),
    whole = (contract as record) as text => Text.Combine(List.Select({contract[Status],
        if contract[Start] = null then "" else "starts " & fnLongDate(contract[Start]), if contract[End] = null then "" else "ends " & fnLongDate(contract[End])}, (part) => part <> ""), ", "),
    tab = (contract as record) as text => if contract[Sheet] = "terminated" then " (terminated in the last 7 days)" else "",
    // A line of the table: [Kind, Number, Name, Vendor, Field, Before, After, Status, End, DaysLeft].
    lineOf = (kind as text, contract as record, field as text, before as text, after as text) as list =>
        {kind, contract[Number], contract[Name], contract[Vendor], field, before, after, contract[Status], contract[End], null},
    changes =
        if current = null or previous = null then {}
        else
            let
                beforeGroups = fnGroupBy(previous[Contracts], (contract) => lower(contract[Number])),
                before = Record.FromList(List.Transform(Record.FieldValues(beforeGroups), List.Last), Record.FieldNames(beforeGroups)),
                now = fnKeySet(List.Transform(current[Contracts], (contract) => lower(contract[Number]))),
                fields = List.Buffer(List.Transform(ReadingRules[contractChangeFields], (entry) => entry & [Column = fnPascal(entry[field])])),
                compared = List.Transform(current[Contracts], (contract) => [Now = contract, Old = Record.FieldOrDefault(before, lower(contract[Number]), null)]),
                added = List.Transform(List.Select(compared, (item) => item[Old] = null), (item) => lineOf("New contract", item[Now], "", "", whole(item[Now]))),
                left = List.Transform(List.Select(previous[Contracts], (contract) => not Record.HasFields(now, lower(contract[Number]))),
                    (contract) => lineOf("No longer in the file", contract, "", whole(contract), "")),
                kept = List.Buffer(List.Select(compared, (item) => item[Old] <> null)),
                status = List.Transform(List.Select(kept, (item) => not words[SameWord](item[Old][Status], item[Now][Status]) or item[Old][Sheet] <> item[Now][Sheet]),
                    (item) => lineOf("Status change", item[Now], "Status", shown(item[Old][Status]) & tab(item[Old]), shown(item[Now][Status]) & tab(item[Now]))),
                changed = List.Combine(List.Transform(kept, (item) => List.Transform(List.Select(fields, (entry) =>
                    let was = Record.Field(item[Old], entry[Column]), later = Record.Field(item[Now], entry[Column]) in
                    if entry[date] then was <> later else not words[SameWord](if was = null then "" else was, if later = null then "" else later)),
                    (entry) => lineOf("Changed field", item[Now], entry[label], shown(Record.Field(item[Old], entry[Column])), shown(Record.Field(item[Now], entry[Column]))))))
            in
                added & left & status & changed,
    information =
        if current = null or config = null then {}
        else
            let
                active = List.Buffer(List.Select(current[Contracts], (contract) => contract[Sheet] = "active")),
                concluded = List.Select(List.Positions(active), (at) => words[InList](config[concludedStatuses], active{at}[Status]) and active{at}[End] <> null and active{at}[End] >= current[Date]),
                ending = List.Transform(List.Sort(concluded, (a, b) => Value.Compare(active{a}[End], active{b}[End]) * 2 + Value.Compare(a, b)), (at) =>
                    let contract = active{at} in
                    List.FirstN(lineOf("Concluded with an end date", contract, "", "", ""), 9) & {Duration.Days(contract[End] - current[Date])}),
                noDaily = List.Transform(List.Select(active, (contract) => words[InList](config[runningStatuses], contract[Status]) and contract[DailyResponsible] = ""),
                    (contract) => lineOf("No daily responsible", contract, "", "", ""))
            in
                ending & noDaily,
    // Buffered: each row below reads its line by position, and a list that is not buffered is worked out again each time.
    lines = List.Buffer(changes & information),
    kinds = {"New contract", "No longer in the file", "Status change", "Changed field", "Concluded with an end date", "No daily responsible"}
in
    #table(
        type table [Line = Int64.Type, Kind = text, KindOrder = Int64.Type, Number = text, Name = text, Vendor = text, Field = text, Before = text, After = text,
            Status = text, End = nullable date, DaysLeft = nullable Int64.Type, FileDate = nullable date, EarlierDate = nullable date],
        List.Transform(List.Positions(lines), (at) => let line = lines{at} in
            {at + 1, line{0}, List.PositionOf(kinds, line{0}) + 1} & List.Range(line, 1) & {if current = null then null else current[Date], if previous = null then null else previous[Date]}))
