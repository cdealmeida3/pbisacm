// One report per type and day, chosen by its content (D348, src/core/memory/finder.ts, chooseReports): of the files of
// one report type and one report date, the one with the most of the needed columns (for a CI report the columns the
// checks read, else its named columns: neededColumns of report-types.ts), then the most rows, then the one changed
// last, then the last file name, is the report of that day (Used). The others are not used, with the reason in
// WhyNotUsed; a file name never decides alone. A file of no report type (Kind "unknown", or a file the Workbench knows
// but does not use) is never used. Only a date with two files of one type is measured, so one file a day costs nothing.
(files as table) as table =>
    let
        reportKinds = List.Buffer(List.Transform(ReadingRules[reportTypes], (reportType) => reportType[kind])),
        keyOf = (kind as text, day as nullable date) as text =>
            kind & "|" & (if day = null then "" else Date.ToText(day, [Format = "yyyy-MM-dd", Culture = "en-US"])),
        keyed = Table.AddColumn(files, "ChoiceKey", each keyOf([Kind], [ReportDate]), type text),
        counts = Table.Group(keyed, {"ChoiceKey"}, {{"Count", Table.RowCount, Int64.Type}}),
        twice = List.Buffer(Table.SelectRows(counts, each [Count] > 1)[ChoiceKey]),
        measured = Table.Buffer(Table.AddColumn(keyed, "Fullness", each
            if List.Contains(twice, [ChoiceKey]) and List.Contains(reportKinds, [Kind]) then
                [
                    FileName = [FileName],
                    Columns = if [Kind] = "ci" then
                        let found = fnCiColumns([Read]) in List.Count(List.Select(ReadingRules[wantedColumns], (entry) => List.Contains(found, entry[column])))
                    else List.Count(List.Distinct(List.Select([Read][Headers], (header) => header <> ""))),
                    Rows = Table.RowCount([Read][Rows]),
                    Modified = if [Modified] = null then 0 else Number.From([Modified])
                ]
            else null)),
        // Fuller first: more of the needed columns, more rows, changed later, the last file name (Comparer.Ordinal: as JavaScript's < ).
        fuller = (a as record, b as record) as number =>
            if a[Columns] <> b[Columns] then (if a[Columns] > b[Columns] then -1 else 1)
            else if a[Rows] <> b[Rows] then (if a[Rows] > b[Rows] then -1 else 1)
            else if a[Modified] <> b[Modified] then (if a[Modified] > b[Modified] then -1 else 1)
            else Comparer.Ordinal(b[FileName], a[FileName]),
        // The files of one key share their kind, so every one of them is measured.
        bestOf = (key as text) as record => List.Sort(Table.SelectRows(measured, each [ChoiceKey] = key)[Fullness], fuller){0},
        whyOf = (best as record, file as record) as text =>
            "Not used: " & best[FileName] & " of the same day " & (
                if best[Columns] <> file[Columns] then
                    "has more of the needed columns (" & Text.From(best[Columns]) & " against " & Text.From(file[Columns]) & "), so it is used."
                else if best[Rows] <> file[Rows] then
                    "has more rows (" & Text.From(best[Rows]) & " against " & Text.From(file[Rows]) & "), so it is used."
                else
                    "has the same columns and rows and is used (" & (if best[Modified] <> file[Modified] then "it was saved later" else "the last file name")
                        & "). Move this copy into the sub-folder Archive."),
        choice = Table.AddColumn(measured, "Choice", each
            if not List.Contains(reportKinds, [Kind]) then [Used = false, WhyNotUsed = ""]
            else if [Fullness] = null then [Used = true, WhyNotUsed = ""]
            else
                let best = bestOf([ChoiceKey]) in
                if best[FileName] = [FileName] then [Used = true, WhyNotUsed = ""] else [Used = false, WhyNotUsed = whyOf(best, [Fullness])]),
        expanded = Table.ExpandRecordColumn(Table.RemoveColumns(choice, {"ChoiceKey", "Fullness"}), "Choice", {"Used", "WhyNotUsed"}),
        typed = Table.TransformColumnTypes(expanded, {{"Used", type logical}, {"WhyNotUsed", type text}})
    in
        Table.Buffer(typed)
