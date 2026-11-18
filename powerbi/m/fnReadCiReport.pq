// The CI report as one row per CI with the canonical columns of ReadingRules[ciColumns] (src/core/sources/ci/ci-report.ts,
// readCiReport). A row without a name is left out. Key is the SACM identity: the name; the asset tag is added only when
// two CIs share a name, and the order in the report when that does not separate them either. NameSpaces: the name in the
// file starts or ends with a space, a tab or a no-break space (the rule "outer-space" of reference/name-rules).
// Speed (ARCHITECTURE §12, the speed rules): column by column, every column a buffered list read by position; a flag,
// level or status column and the class have few distinct values, so each distinct value is converted once; only the
// rows whose Key1 is shared are numbered. The table is made once, at the end.
(read as record) as table =>
    let
        specs = List.Buffer(ReadingRules[ciColumns]),
        names = List.Buffer(List.Transform(specs, (spec) => spec[column])),
        nameSpec = List.First(List.Select(specs, (spec) => spec[column] = "Name")),
        nameAt = fnColumnIndex(read[Headers], nameSpec[any]),
        sourceColumns = Table.ColumnNames(read[Rows]),
        count = Table.RowCount(read[Rows]),
        rawNames = List.Buffer(if nameAt < 0 or nameAt >= List.Count(sourceColumns) then List.Repeat({""}, count) else Table.Column(read[Rows], sourceColumns{nameAt})),
        picked = fnPickColumns(read, specs)[Columns],
        columnOf = (name as text) as list => picked{List.PositionOf(names, name)},
        // The rows with a name, by their place in the report.
        nameColumn = columnOf("Name"),
        kept = List.Buffer(List.Select(List.Positions(nameColumn), (at) => nameColumn{at} <> "")),
        keep = (column as list) as list => List.Buffer(List.Transform(kept, (at) => column{at})),
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
        // A column of few distinct values: each value converted once, then looked up.
        byValue = (column as list, change as function) as list =>
            let
                distinct = List.Buffer(List.Distinct(column)),
                converted = Record.FromList(List.Transform(distinct, change), distinct)
            in
                List.Buffer(List.Transform(column, (value) => Record.Field(converted, value))),
        few = {"flag", "level", "status"},
        values = List.Buffer(List.Transform(List.Positions(specs), (position) =>
            let
                spec = specs{position},
                column = keep(picked{position})
            in
                if List.Contains(few, spec[kind]) then byValue(column, convert(spec[kind]))
                else if spec[kind] = "text" then column
                else List.Buffer(List.Transform(column, convert(spec[kind]))))),
        valueOf = (name as text) as list => values{List.PositionOf(names, name)},
        classes = byValue(valueOf("SourceClass"), fnCanonicalClass),
        outer = {" ", "#(tab)", "#(00A0)"},
        spaces = List.Buffer(List.Transform(keep(rawNames), (name) =>
            let raw = if Text.StartsWith(name, "#(FEFF)") then Text.Middle(name, 1) else name in
            raw <> "" and (List.Contains(outer, Text.Start(raw, 1)) or List.Contains(outer, Text.End(raw, 1))))),
        baseKeys = List.Buffer(List.Transform(valueOf("Name"), (name) => fnNameKey(name, "?"))),
        tags = valueOf("AssetTag"),
        rows = List.Buffer(List.Positions(baseKeys)),
        // How many CIs have each base key, and then each Key1, as records (fnCountBy).
        sameName = fnCountBy(baseKeys),
        key1s = List.Buffer(List.Transform(rows, (row) =>
            let base = baseKeys{row}, tag = tags{row} in
            if Record.Field(sameName, base) > 1 and tag <> "" then base & "|" & Text.Lower(tag, "en-US") else base)),
        sameKey1 = fnCountBy(key1s),
        // Only a Key1 that several CIs share gets a number: the place of the CI among them, in report order.
        sharing = List.Select(rows, (row) => Record.Field(sameKey1, key1s{row}) > 1),
        groups = Table.Group(Table.FromColumns({List.Transform(sharing, (row) => key1s{row}), sharing}, {"Key1", "Row"}), {"Key1"}, {{"Rows", each _[Row]}}),
        nthOf = Record.Combine({[]} & List.Transform(groups[Rows],
            (group) => Record.FromList(List.Numbers(1, List.Count(group)), List.Transform(List.Sort(group), Text.From)))),
        keys = List.Transform(rows, (row) =>
            let nth = Record.FieldOrDefault(nthOf, Text.From(row), 1) in if nth = 1 then key1s{row} else key1s{row} & "#" & Text.From(nth)),
        built = Table.FromColumns({keys, classes} & values & {spaces}, {"Key", "Class"} & names & {"NameSpaces"}),
        typed = Table.TransformColumnTypes(built, {{"Key", type text}, {"Class", type text}, {"NameSpaces", type logical}}
            & List.Transform(specs, (spec) => {spec[column], typeOf(spec[kind])}))
    in
        typed
