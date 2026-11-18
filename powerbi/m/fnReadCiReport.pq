// The CI report as one row per CI with the canonical columns of ReadingRules[ciColumns] (src/core/sources/ci/ci-report.ts,
// readCiReport). A row without a name is left out. Key is the SACM identity: the name; the asset tag is added only when
// two CIs share a name, and the order in the report when that does not separate them either. NameSpaces: the name in the
// file starts or ends with a space, a tab or a no-break space (the rule "outer-space" of reference/name-rules).
(read as record) as table =>
    let
        specs = ReadingRules[ciColumns],
        nameSpec = List.First(List.Select(specs, (spec) => spec[column] = "Name")),
        nameAt = fnColumnIndex(read[Headers], nameSpec[any]),
        rawNames = List.Transform(Table.ToRows(read[Rows]), (row) => if nameAt < 0 or nameAt >= List.Count(row) then "" else row{nameAt}),
        pickedOnly = fnPickColumns(read, specs)[Table],
        picked = Table.FromColumns(Table.ToColumns(pickedOnly) & {rawNames}, Table.ColumnNames(pickedOnly) & {"RawName"}),
        named = Table.SelectRows(picked, each [Name] <> ""),
        convert = (kind as text) as function =>
            if kind = "flag" then (value) => fnFlag(value)
            else if kind = "level" then (value) => fnLevel(value)
            else if kind = "date" then (value) => fnParseDate(value)
            else if kind = "status" then (value) => Record.FieldOrDefault(ReadingRules[operationalStatus], value, value)
            else if kind = "tags" then (value) => Text.Combine(List.Select(List.Transform(Text.Split(value, ","), Text.Trim), each _ <> ""), ", ")
            else (value) => value,
        typeOf = (kind as text) as type =>
            if kind = "flag" then type nullable logical
            else if kind = "level" then Int64.Type
            else if kind = "date" then type nullable date
            else type text,
        typed = Table.TransformColumns(named, List.Transform(specs, (spec) => {spec[column], convert(spec[kind]), typeOf(spec[kind])})),
        withClass = Table.AddColumn(typed, "Class", each fnCanonicalClass([SourceClass]), type text),
        outer = {" ", "#(tab)", "#(00A0)"},
        withSpaces = Table.AddColumn(withClass, "NameSpaces", each
            let raw = if Text.StartsWith([RawName], "#(FEFF)") then Text.Middle([RawName], 1) else [RawName] in
            raw <> "" and (List.Contains(outer, Text.Start(raw, 1)) or List.Contains(outer, Text.End(raw, 1))), type logical),
        withBase = Table.AddColumn(withSpaces, "BaseKey", each fnNameKey([Name], "?"), type text),
        indexed = Table.AddIndexColumn(withBase, "Row", 0, 1, Int64.Type),
        counts = Table.Group(indexed, {"BaseKey"}, {{"SameName", each Table.RowCount(_), Int64.Type}}),
        joined = Table.Join(indexed, "BaseKey", Table.RenameColumns(counts, {{"BaseKey", "CountKey"}}), "CountKey"),
        withKey1 = Table.AddColumn(joined, "Key1", each
            if [SameName] > 1 and [AssetTag] <> "" then [BaseKey] & "|" & Text.Lower([AssetTag], "en-US") else [BaseKey], type text),
        numbered = Table.Combine(Table.Group(withKey1, {"Key1"}, {{"Rows", each Table.AddIndexColumn(Table.Sort(_, {{"Row", Order.Ascending}}), "Nth", 1, 1, Int64.Type)}})[Rows]),
        withKey = Table.AddColumn(numbered, "Key", each if [Nth] = 1 then [Key1] else [Key1] & "#" & Text.From([Nth]), type text),
        sorted = Table.Sort(withKey, {{"Row", Order.Ascending}}),
        ordered = Table.SelectColumns(sorted, {"Key", "Class"} & List.Transform(specs, (spec) => spec[column]) & {"NameSpaces"})
    in
        ordered
