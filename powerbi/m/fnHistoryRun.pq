// Table HistoryRun (hidden, D290): the checks on every CI report dated from `start` (that day or later) to `end` (before
// that day), each with the other reports dated on or before it, as the rows of five parts: History (the findings),
// HistoryTested, HistoryNotes, HistoryChecked (what the report could verify) and Runs. The DAX tables of those names split
// it, as Run is split (D284). Incremental refresh calls it for each part of the history with RangeStart and RangeEnd:
// keep 24 months, look at the last 7 days and compute again only the days whose files changed (HistoryPolling), so an
// old report date is computed once, not at every refresh. The pages of the
// newest report never read it: they read Run, which is always computed in full. Only the files of the ReadDays days
// before `start` up to `end` are opened. Two CI reports of one day: the last file name is the run of that day.
(start as datetime, end as datetime) as table =>
    let
        from = DateTime.Date(start),
        to = DateTime.Date(end),
        files = fnReadFiles(Date.AddDays(from, -ReadDays), to),
        cis = Table.Buffer(Table.Sort(Table.SelectRows(files, each [Kind] = "ci" and [ReportDate] <> null and [ReportDate] >= from and [ReportDate] < to),
            {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}})),
        days = List.Buffer(List.Distinct(cis[ReportDate])),
        runOf = (day as date) as record => fnCheckRun(Table.Last(Table.SelectRows(cis, each [ReportDate] = day)), files),
        partsOf = (run as record) as list => {
            {"History", fnHistoryPart(run)}, {"HistoryTested", fnTestedPart(run)}, {"HistoryNotes", fnNotesPart(run)},
            {"HistoryChecked", fnHistoryCheckedPart(run)}, {"Runs", fnRunsPart(run)}
        },
        // Each part with its columns named <Part>.<Column> and a column Part, typed as the calculated table that shows it
        // (HistoryRunColumnTypes, generated), as in RunRows.
        prefixed = (part as list) as table =>
            let
                name = part{0},
                rows = part{1},
                renamed = Table.RenameColumns(rows, List.Transform(Table.ColumnNames(rows), (column) => {column, name & "." & column})),
                present = Table.ColumnNames(renamed),
                own = List.Select(HistoryRunColumnTypes, (pair) => List.Contains(present, pair{0}))
            in
                Table.AddColumn(Table.TransformColumnTypes(renamed, own), "Part", each name, type text),
        perDay = List.Transform(days, (day) =>
            let
                run = runOf(day),
                combined = Table.Combine(List.Transform(partsOf(run), prefixed))
            in
                Table.AddColumn(combined, "ReportDate", each day, type date)),
        // With no CI report in the dates, every column is still there, so a refresh of an empty part of the history works.
        // Each part is typed alone, before the parts are put together (as in RunRows, D307); the empty frame types every column.
        types = {{"Part", type text}, {"ReportDate", type date}} & HistoryRunColumnTypes,
        empty = Table.TransformColumnTypes(#table(List.Transform(types, (pair) => pair{0}), {}), types),
        typed = Table.Combine({empty} & perDay)
    in
        Table.ReorderColumns(typed, {"Part", "ReportDate"} & List.Select(Table.ColumnNames(typed), (column) => column <> "Part" and column <> "ReportDate"))
