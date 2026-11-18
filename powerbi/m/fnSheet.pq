// One sheet as the readers use it: the normalised headers, the headers as written, and the rows after the header row as
// text (Column1 ... ColumnN). Rows where every cell is empty are left out, as the HTML app does.
(name as text, data as table) as record =>
    let
        columns = Table.ColumnNames(data),
        asText = Table.TransformColumns(data, List.Transform(columns, (column) => {column, fnCellText, type text})),
        rows = Table.SelectRows(asText, each List.MatchesAny(Record.FieldValues(_), (cell) => Text.Trim(cell) <> "")),
        header = if Table.IsEmpty(rows) then {} else Record.FieldValues(rows{0}),
        body = Table.Buffer(Table.Skip(rows, 1))
    in
        [Name = name, RawHeaders = header, Headers = List.Transform(header, fnNormaliseHeader), Rows = body]
