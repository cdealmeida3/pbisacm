// The columns a reader needs, by header form, as a table of trimmed text with one column per spec (named spec[column]).
// A column the report does not have is "" on every row; Found lists the specs that were found, Missing the others.
(sheet as record, specs as list) as record =>
    let
        positions = List.Transform(specs, (spec) => fnColumnIndex(sheet[Headers], spec[any], Record.FieldOrDefault(spec, "suffix", false))),
        names = List.Transform(specs, (spec) => spec[column]),
        rows = List.Transform(Table.ToRows(sheet[Rows]), (row) =>
            List.Transform(positions, (position) => if position < 0 or position >= List.Count(row) then "" else Text.Trim(row{position}))),
        table = Table.FromRows(rows, names)
    in
        [
            Table = table,
            Found = List.Select(names, (name) => positions{List.PositionOf(names, name)} >= 0),
            Missing = List.Select(names, (name) => positions{List.PositionOf(names, name)} < 0)
        ]
