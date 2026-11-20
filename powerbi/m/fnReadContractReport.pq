// The ServiceNow contract report, one row per contract (src/core/sources/contracts/contract-reports.ts, readContractReport).
// A row without a number is left out. Criticality is true when any of the criticality columns is filled.
(read as record) as table =>
    let
        columns = ReferenceFiles[#"contract-reports"][servicenow][columns],
        names = List.Select(Record.FieldNames(columns), (name) => name <> "criticality"),
        specs = List.Transform(names, (name) => [column = name, any = Record.Field(columns, name)]),
        // The criticality columns by the end of their name, whatever the prefix (u_, or the instance's scoped-app prefix, D351).
        isCritical = (header as text) as logical => List.AnyTrue(List.Transform(columns[criticality], (end) => header = end or Text.EndsWith(header, "_" & end))),
        critical = List.Select(List.Positions(read[Headers]), (position) => isCritical(read[Headers]{position})),
        picked = fnPickColumns(read, specs)[Table],
        criticalRows = List.Transform(Table.ToRows(read[Rows]), (row) =>
            List.AnyTrue(List.Transform(critical, (position) => position < List.Count(row) and Text.Trim(row{position}) <> ""))),
        withCritical = Table.FromColumns(Table.ToColumns(picked) & {criticalRows}, Table.ColumnNames(picked) & {"criticality"}),
        numbered = Table.SelectRows(withCritical, each [number] <> ""),
        typed = Table.TransformColumns(numbered, {
            {"start", fnParseDate, type nullable date}, {"end", fnParseDate, type nullable date},
            {"ownerActive", each fnFlag(_, true), type nullable logical}, {"procurementPartnerActive", each fnFlag(_, true), type nullable logical},
            {"ownerUserId", each Text.Lower(_, "en-US"), type text}, {"procurementPartnerUserId", each Text.Lower(_, "en-US"), type text},
            {"tags", each Text.Combine(List.Select(List.Transform(Text.Split(_, ","), Text.Trim), (tag) => tag <> ""), ", "), type text},
            {"criticality", each _, type logical}}),
        renamed = Table.TransformColumnNames(typed, (name) => Text.Upper(Text.Start(name, 1)) & Text.Middle(name, 1))
    in
        renamed
