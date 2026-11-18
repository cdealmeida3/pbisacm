// Table ReportTypes: one row per report type (src/core/sources/report-types.ts), with its newest file. The Reports page
// shows one line per type; the age and "old" are DAX, so they are right on any day (D14).
let
    types = ReadingRules[reportTypes],
    row = (position as number) as list =>
        let
            reportType = types{position},
            newest = fnNewest(reportType[kind]),
            file = if Table.IsEmpty(newest) then null else newest{0}
        in
            {
                reportType[kind], reportType[label], reportType[hint], position + 1, Record.FieldOrDefault(reportType, "staleAfter", ReadingRules[staleDays]),
                Table.RowCount(Table.SelectRows(ReadFiles, each [Kind] = reportType[kind])),
                if file = null then null else file[FileName],
                if file = null then null else file[ReportDate],
                if file = null then null else Table.RowCount(fnReadKind(reportType[kind], file[Read]))
            }
in
    #table(
        type table [Kind = text, Label = text, Hint = text, Order = Int64.Type, StaleAfter = Int64.Type, Files = Int64.Type,
            NewestFile = nullable text, NewestDate = nullable date, NewestRows = nullable Int64.Type],
        List.Transform(List.Positions(types), row))
