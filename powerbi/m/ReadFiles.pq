// Every report file read once: its sheets (Read), its type by its columns (Kind, TypeLabel) and why it was not read
// (Message). A file that cannot be opened is not read, with the reason, and the refresh goes on.
let
    read = Table.AddColumn(ReportSourceFiles, "Read", each
        let attempt = try fnReadTable([Content]) in
        if attempt[HasError] then [Format = "", Sheets = {}, Headers = {}, RawHeaders = {}, Rows = #table({}, {}), Error = attempt[Error][Message]]
        else attempt[Value]),
    typed = Table.AddColumn(read, "Type", each
        if Record.HasFields([Read], "Error") then [Kind = "", Label = "Not read", Message = "The file could not be opened: " & [Read][Error]]
        else fnReportType([Read][Headers])),
    expanded = Table.ExpandRecordColumn(typed, "Type", {"Kind", "Label", "Message"}, {"Kind", "TypeLabel", "Message"})
in
    Table.Buffer(expanded)
