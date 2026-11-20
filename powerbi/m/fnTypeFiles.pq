// Report files (FileName, Modified, Content, ReportDate), each read once: its sheets (Read), its type by its columns
// (Kind, TypeLabel), why it was not read (Message), and whether it is the report of its type and day (Used, WhyNotUsed:
// fnChooseFiles, D348). A file that cannot be opened is not read (Kind "unknown"), with the reason, and the refresh goes
// on. fnReadFiles gives it the files of its dates; the Power BI check gives it the real-shape samples (D353).
(files as table) as table =>
    let
        read = Table.AddColumn(files, "Read", each
            // The headers are read inside the try: a workbook opens only when its sheets are read, so a file that cannot
            // be opened fails here, as its own row, and never spoils the choice of the other files.
            let attempt = try (let value = fnReadTable([Content]) in value & [Headers = List.Buffer(value[Headers])]) in
            if attempt[HasError] then [Format = "", Sheets = {}, Headers = {}, RawHeaders = {}, Rows = #table({}, {}), Error = attempt[Error][Message]]
            else attempt[Value]),
        typed = Table.AddColumn(read, "Type", each
            if Record.HasFields([Read], "Error") then [Kind = "unknown", Label = "Not a report", Message = "The file could not be opened: " & [Read][Error]]
            else fnReportType([Read][Headers])),
        expanded = Table.ExpandRecordColumn(typed, "Type", {"Kind", "Label", "Message"}, {"Kind", "TypeLabel", "Message"})
    in
        fnChooseFiles(Table.Buffer(expanded))
