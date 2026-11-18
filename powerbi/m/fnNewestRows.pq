// The rows of the newest report of a type, read by its reader, with ReportDate and FileName in front. When no report of
// the type is there: an empty table with the same columns.
(kind as text) as table =>
    let
        newest = fnNewest(kind),
        file = if Table.IsEmpty(newest) then null else newest{0},
        rows = fnReadKind(kind, if file = null then EmptyRead else file[Read]),
        withDate = Table.AddColumn(rows, "ReportDate", each file[ReportDate], type nullable date),
        withFile = Table.AddColumn(withDate, "FileName", each file[FileName], type text)
    in
        Table.ReorderColumns(withFile, {"ReportDate", "FileName"} & Table.ColumnNames(rows))
