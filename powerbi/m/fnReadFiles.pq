// The report files dated from `from` (that day or later) up to `to` (before that day), each read once: its sheets (Read),
// its type by its columns (Kind, TypeLabel) and why it was not read (Message). null leaves that end open; a file with no
// date is always kept. A file outside the dates is never opened, so an old folder stays fast (D290). A file that cannot
// be opened is not read, with the reason, and the refresh goes on.
(from as nullable date, to as nullable date) as table =>
    let
        kept = Table.SelectRows(ReportSourceFiles, each [ReportDate] = null or ((from = null or [ReportDate] >= from) and (to = null or [ReportDate] < to))),
        read = Table.AddColumn(kept, "Read", each
            let attempt = try fnReadTable([Content]) in
            if attempt[HasError] then [Format = "", Sheets = {}, Headers = {}, RawHeaders = {}, Rows = #table({}, {}), Error = attempt[Error][Message]]
            else attempt[Value]),
        typed = Table.AddColumn(read, "Type", each
            if Record.HasFields([Read], "Error") then [Kind = "", Label = "Not read", Message = "The file could not be opened: " & [Read][Error]]
            else fnReportType([Read][Headers])),
        expanded = Table.ExpandRecordColumn(typed, "Type", {"Kind", "Label", "Message"}, {"Kind", "TypeLabel", "Message"})
    in
        Table.Buffer(expanded)
