// The Solusi contract file, one row per contract (src/core/sources/contracts/contract-reports.ts, readSolusiFile). Every
// sheet with the contract number column is read; row 2 holds labels and is left out. A sheet with a termination date
// column holds the contracts terminated in the last 7 days; a contract on both tabs counts once, as terminated.
(read as record) as table =>
    let
        config = ReferenceFiles[#"contract-reports"][solusi],
        columns = config[columns],
        names = Record.FieldNames(columns),
        specs = List.Transform(names, (name) => [column = name, any = Record.Field(columns, name)]),
        labels = List.Transform(config[labelRow], (label) => fnNameKey(label, "")),
        sheetRows = (sheet as record) as table =>
            let
                picked = fnPickColumns(sheet, specs),
                kind = if List.Contains(picked[Found], "terminated") then "terminated" else "active",
                rows = Table.SelectRows(picked[Table], each [number] <> "" and not List.Contains(labels, fnNameKey([number], "")))
            in
                if List.Contains(picked[Found], "number") then Table.AddColumn(rows, "sheet", each kind, type text) else null,
        tables = List.RemoveNulls(List.Transform(read[Sheets], sheetRows)),
        all = if List.IsEmpty(tables) then #table(names & {"sheet"}, {}) else Table.Combine(tables),
        indexed = Table.AddIndexColumn(all, "Row", 0, 1, Int64.Type),
        withKey = Table.AddColumn(indexed, "NumberKey", each Text.Lower([number], "en-US"), type text),
        // The last terminated row of a number wins, else the first row of the number. It keeps the place of the first row
        // of its number, as a JavaScript Map does in src/core.
        ranked = Table.AddColumn(withKey, "Rank", each if [sheet] = "terminated" then 1000000000 + [Row] else -[Row], type number),
        best = Table.Combine(Table.Group(ranked, {"NumberKey"}, {{"Rows", (group) => let place = List.Min(group[Row]) in
            Table.AddColumn(Table.FirstN(Table.Sort(group, {{"Rank", Order.Descending}}), 1), "Place", each place, Int64.Type)}})[Rows]),
        sorted = Table.Sort(best, {{"Place", Order.Ascending}}),
        dates = Table.TransformColumns(sorted, {{"start", fnParseDate, type nullable date}, {"end", fnParseDate, type nullable date}, {"terminated", fnParseDate, type nullable date}}),
        renamed = Table.RenameColumns(dates, {
            {"number", "Number"}, {"status", "Status"}, {"name", "Name"}, {"vendor", "Vendor"}, {"vendorNumber", "VendorNumber"},
            {"category", "Category"}, {"start", "Start"}, {"end", "End"}, {"duration", "Duration"}, {"owner", "Owner"},
            {"dailyResponsible", "DailyResponsible"}, {"procurementPartner", "ProcurementPartner"}, {"epoId", "EpoId"},
            {"sheet", "Sheet"}, {"terminated", "Terminated"}})
    in
        Table.SelectColumns(renamed, {"Number", "Status", "Name", "Vendor", "VendorNumber", "Category", "Start", "End", "Duration",
            "Owner", "DailyResponsible", "ProcurementPartner", "EpoId", "Sheet", "Terminated"})
