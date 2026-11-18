// The columns a reader needs, by header form, as a table of trimmed text with one column per spec (named spec[column]).
// A column the report does not have is "" on every row; Found lists the specs that were found, Missing the others.
// Columns: the same columns as buffered lists, in the order of the specs.
// Column by column (one Text.Trim per cell, no list per row).
(sheet as record, specs as list) as record =>
    let
        positions = List.Transform(specs, (spec) => fnColumnIndex(sheet[Headers], spec[any], Record.FieldOrDefault(spec, "suffix", false))),
        names = List.Transform(specs, (spec) => spec[column]),
        rows = sheet[Rows],
        sourceColumns = Table.ColumnNames(rows),
        count = Table.RowCount(rows),
        // Each column buffered: a table made of lazy lists and taken apart again with Table.ToColumns took 39 s for
        // 760 CIs (measured in the speed build).
        columns = List.Buffer(List.Transform(positions, (position) =>
            if position < 0 or position >= List.Count(sourceColumns) then List.Repeat({""}, count)
            else List.Buffer(List.Transform(Table.Column(rows, sourceColumns{position}), Text.Trim)))),
        table = Table.FromColumns(columns, names)
    in
        [
            Columns = columns,
            Table = table,
            Found = List.Select(names, (name) => positions{List.PositionOf(names, name)} >= 0),
            Missing = List.Select(names, (name) => positions{List.PositionOf(names, name)} < 0)
        ]
