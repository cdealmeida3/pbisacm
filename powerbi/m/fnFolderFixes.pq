// What to fix in the reports folder, the first box of the Reports page (D352,
// src/core/sources/report-types.ts, folderFixes). In the order of the box: each report type with no file, the columns
// the newest CI report lacks (one line to copy into the ServiceNow report, D347), every file of a report type that is
// not used (two of one type and day, D348), every file of no type, then the files the Workbench knows but does not use
// (D341, D342). FileName is the file, or "No <type>" for a type with no file, so every line has its own name: the page
// sorts the lines by it (sortByColumn Order). Level: "fix" to act on, "known" to know. Empty when the folder needs nothing.
// `files` are typed files (fnTypeFiles): the table FolderFixes gives it ReadFiles, the Power BI check the real-shape samples.
(files as table) as table =>
    let
        reportKinds = List.Buffer(List.Transform(ReadingRules[reportTypes], (reportType) => reportType[kind])),
        types = ReadingRules[reportTypes],
        knownKinds = List.Buffer(List.Transform(ReadingRules[knownFiles], (file) => file[kind])),
        labelOf = (kind as text) as text =>
            let found = List.Select(types & ReadingRules[knownFiles], (entry) => entry[kind] = kind) in
            if List.IsEmpty(found) then "Not a report" else found{0}[label],
        missingTypes = List.Transform(
            List.Select(types, (reportType) => Table.IsEmpty(Table.SelectRows(files, each [Kind] = reportType[kind] and [Used]))),
            (reportType) => {"No " & reportType[label], null, reportType[label], "No file of this type in the folder, so the cards that need it are grey. Add the report to the folder.", "fix"}),
        newestCi = Table.LastN(Table.Sort(Table.SelectRows(files, each [Kind] = "ci" and [Used]), {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}}), 1),
        ciLine =
            if Table.IsEmpty(newestCi) then {}
            else
                let
                    file = newestCi{0},
                    found = fnCiColumns(file[Read]),
                    missing = List.Transform(List.Select(ReadingRules[wantedColumns], (entry) => not List.Contains(found, entry[column])), (entry) => entry[field]),
                    count = List.Count(missing)
                in
                    if count = 0 then {}
                    else {{file[FileName], file[ReportDate], labelOf("ci"),
                        "Lacks " & Text.From(count) & (if count = 1 then " column" else " columns") & " the checks read, so some cards are grey or partly tested. Add "
                            & (if count = 1 then "it" else "them") & " to the ServiceNow report: " & Text.Combine(missing, ", ") & ".", "fix"}},
        byName = (rows as list) as list => List.Sort(rows, (a, b) => Comparer.Ordinal(a[FileName], b[FileName])),
        records = Table.ToRecords(Table.SelectColumns(files, {"FileName", "ReportDate", "Kind", "Used", "WhyNotUsed", "Message"})),
        notUsed = List.Transform(byName(List.Select(records, (file) => not file[Used] and not List.Contains(knownKinds, file[Kind]))), (file) =>
            {file[FileName], file[ReportDate], labelOf(file[Kind]), if List.Contains(reportKinds, file[Kind]) then file[WhyNotUsed] else file[Message], "fix"}),
        known = List.Transform(byName(List.Select(records, (file) => List.Contains(knownKinds, file[Kind]))), (file) =>
            {file[FileName], file[ReportDate], labelOf(file[Kind]), file[Message], "known"}),
        rows = missingTypes & ciLine & notUsed & known
    in
        #table(type table [Order = Int64.Type, FileName = text, ReportDate = nullable date, ReadAs = text, What = text, Level = text],
            List.Transform(List.Positions(rows), (at) => {at + 1} & rows{at}))
