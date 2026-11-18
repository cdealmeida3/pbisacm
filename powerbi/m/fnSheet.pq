// One sheet as the readers use it: the normalised headers, the headers as written, and the rows after the header row as
// text (Column1 ... ColumnN). Rows where every cell is empty are left out, as the HTML app does. `isText`: every cell is
// text already, or null for a missing cell (a CSV), so null becomes "" and no cell goes through fnCellText (an .xlsx
// does). A row is empty when its cells joined trim to "": the same as every cell trimming to "", in one call per row.
(name as text, data as table, optional isText as nullable logical) as record =>
    let
        columns = Table.ColumnNames(data),
        asText =
            if isText = true then Table.ReplaceValue(data, null, "", Replacer.ReplaceValue, columns)
            else Table.TransformColumns(data, List.Transform(columns, (column) => {column, fnCellText, type text})),
        rows = Table.SelectRows(asText, each Text.Trim(Text.Combine(Record.FieldValues(_))) <> ""),
        header = if Table.IsEmpty(rows) then {} else Record.FieldValues(rows{0}),
        body = Table.Buffer(Table.Skip(rows, 1))
    in
        [Name = name, RawHeaders = header, Headers = List.Transform(header, fnNormaliseHeader), Rows = body]
