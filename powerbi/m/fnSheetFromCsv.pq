// A CSV text as one sheet. The separator is found on the header line (comma, semicolon or tab; text in quotes does not
// count), as src/core/reading/csv.ts does.
(text as text) as record =>
    let
        firstLine = Text.BeforeDelimiter(Text.Replace(text, "#(cr)", "#(lf)"), "#(lf)"),
        unquoted = Text.Combine(List.Alternate(Text.Split(firstLine, """"), 1, 1, 1)),
        candidates = {",", ";", "#(tab)"},
        counts = List.Transform(candidates, (candidate) => List.Count(Text.Split(unquoted, candidate)) - 1),
        best = List.Max(counts),
        delimiter = if best = 0 then "," else candidates{List.PositionOf(counts, best)},
        width = Table.ColumnCount(Csv.Document(firstLine, [Delimiter = delimiter, QuoteStyle = QuoteStyle.Csv])),
        table = Csv.Document(text, [Delimiter = delimiter, Columns = width, QuoteStyle = QuoteStyle.Csv, ExtraValues = ExtraValues.Ignore])
    in
        fnSheet("", table)
