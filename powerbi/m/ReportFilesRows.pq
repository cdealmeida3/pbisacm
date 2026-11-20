// Table ReportFiles: every report file, its type (by its columns), its report date, how many rows its reader read, and
// whether it is the report of its type and day (Used, WhyNotUsed: fnChooseFiles, D348). IsRead: a file of one of the
// report types; a file the Workbench knows but does not use (a CMDB Health result, the contract–CI links) is not read.
let
    withRows = Table.AddColumn(ReadFiles, "Rows", each
        let rows = fnReadKind([Kind], [Read]) in if rows = null then Table.RowCount([Read][Rows]) else Table.RowCount(rows), Int64.Type),
    withFormat = Table.AddColumn(withRows, "Format", each [Read][Format], type text),
    withColumns = Table.AddColumn(withFormat, "Columns", each List.Count([Read][Headers]), Int64.Type),
    reportKinds = List.Buffer(List.Transform(ReadingRules[reportTypes], (reportType) => reportType[kind])),
    withIsRead = Table.AddColumn(withColumns, "IsRead", each List.Contains(reportKinds, [Kind]), type logical),
    selected = Table.SelectColumns(withIsRead, {"FileName", "ReportDate", "Kind", "TypeLabel", "Format", "Rows", "Columns", "IsRead", "Used", "WhyNotUsed", "Message"})
in
    Table.TransformColumnTypes(selected, {{"FileName", type text}, {"Kind", type text}, {"TypeLabel", type text}, {"Used", type logical}, {"WhyNotUsed", type text}, {"Message", type text}})
