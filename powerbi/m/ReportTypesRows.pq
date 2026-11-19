// Table ReportTypes: one row per report type (src/core/sources/report-types.ts), with its newest file. The Reports page
// shows one line per type; the age and "old" are DAX, so they are right on any day (D14). The rows read from the newest
// file are the measure Newest rows (the Rows of that file in ReportFiles): no file is opened here (build B8, D307).
// Then one row per file the Workbench knows but does not use (ReadingRules[knownFiles]) and the row "unknown" for a file
// of no type, with IsReport false: every Kind of ReportFiles has its row here, so the relationship never adds a blank
// row, and the counts of the reports leave these rows out (D349).
let
    types = ReadingRules[reportTypes],
    others = ReadingRules[knownFiles] & {[kind = "unknown", label = "Not a report", hint = "A file of no type the Workbench knows"]},
    row = (reportType as record, position as number, isReport as logical) as list =>
        let
            newest = if isReport then fnNewest(reportType[kind])
                else Table.LastN(Table.Sort(Table.SelectRows(ReadFiles, each [Kind] = reportType[kind]), {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}}), 1),
            file = if Table.IsEmpty(newest) then null else newest{0}
        in
            {
                reportType[kind], reportType[label], reportType[hint], position + 1, List.Max({CaseRules[StaleDays], Record.FieldOrDefault(reportType, "staleAfter", 0)}),
                Table.RowCount(Table.SelectRows(ReadFiles, each [Kind] = reportType[kind])),
                if file = null then null else file[FileName],
                if file = null then null else file[ReportDate],
                isReport
            }
in
    #table(
        type table [Kind = text, Label = text, Hint = text, Order = Int64.Type, StaleAfter = Int64.Type, Files = Int64.Type,
            NewestFile = nullable text, NewestDate = nullable date, IsReport = logical],
        List.Transform(List.Positions(types), (at) => row(types{at}, at, true))
            & List.Transform(List.Positions(others), (at) => row(others{at}, List.Count(types) + at, false)))
