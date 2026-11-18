// Table ReportFiles: every report file, its type (by its columns), its report date and how many rows its reader read.
let
    withRows = Table.AddColumn(ReadFiles, "Rows", each
        let rows = fnReadKind([Kind], [Read]) in if rows = null then Table.RowCount([Read][Rows]) else Table.RowCount(rows), Int64.Type),
    withFormat = Table.AddColumn(withRows, "Format", each [Read][Format], type text),
    withColumns = Table.AddColumn(withFormat, "Columns", each List.Count([Read][Headers]), Int64.Type),
    withIsRead = Table.AddColumn(withColumns, "IsRead", each [Kind] <> "", type logical),
    selected = Table.SelectColumns(withIsRead, {"FileName", "ReportDate", "Kind", "TypeLabel", "Format", "Rows", "Columns", "IsRead", "Message"})
in
    Table.TransformColumnTypes(selected, {{"FileName", type text}, {"Kind", type text}, {"TypeLabel", type text}, {"Message", type text}})
