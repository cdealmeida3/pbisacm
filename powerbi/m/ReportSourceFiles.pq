// Every report file, whatever the mode: FileName, ReportDate, Modified, Content (D271). Sample: the invented samples
// packed in this file by the generator (SampleFiles). SharePoint: the reports folder of the team site.
let
    sample = Table.TransformColumns(
        Table.RenameColumns(Table.AddColumn(SampleFiles, "Modified", each null, type nullable datetime), {{"Base64", "Content"}}),
        {{"Content", (text) => Binary.FromText(text, BinaryEncoding.Base64), type binary}}),
    files = if SourceMode = "SharePoint" then fnSharePointFiles() else Table.SelectColumns(sample, {"FileName", "Modified", "Content"}),
    reports = Table.SelectRows(files, each fnIsReportFile([FileName])),
    dated = Table.AddColumn(reports, "ReportDate", each fnReportDate([FileName], [Modified]), type nullable date)
in
    Table.Sort(dated, {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}})
