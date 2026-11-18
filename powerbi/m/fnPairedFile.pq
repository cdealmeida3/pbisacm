// The report of a type that goes with a CI report (plan §4.2, as the engine pairs them): among `files` (rows of
// ReadFiles, or of fnReadFiles for the history), the newest report of that type dated on or before the CI report (the last file name when two share a date). Returns [FileName, ReportDate, Rows,
// PreviousDate]: Rows as a list of records, PreviousDate the date of the newest report of the type before it (null when
// it is the first; the chip "changed in EPO" needs it). Null when there is none, so a check that needs it is not tested
// and says so.
(files as table, kind as text, date as nullable date) as nullable record =>
    let
        candidates = Table.SelectRows(files, each [Kind] = kind and date <> null and [ReportDate] <> null and [ReportDate] <= date),
        sorted = Table.Sort(candidates, {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}}),
        newest = Table.LastN(sorted, 1),
        earlier = if Table.IsEmpty(newest) then {} else List.Select(sorted[ReportDate], (day) => day < newest{0}[ReportDate])
    in
        if Table.IsEmpty(newest) then null
        else [
            FileName = newest{0}[FileName], ReportDate = newest{0}[ReportDate], Rows = Table.ToRecords(fnReadKind(kind, newest{0}[Read])),
            PreviousDate = List.Max(earlier, null)
        ]
