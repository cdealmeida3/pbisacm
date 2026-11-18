// How many CIs a CI report has, without reading it all: the rows whose name cell is not empty after trimming, the rule
// of fnReadCiReport (a row without a name is left out). For the table Runs.
(read as record) as number =>
    let
        nameSpec = List.First(List.Select(ReadingRules[ciColumns], (spec) => spec[column] = "Name")),
        nameAt = fnColumnIndex(read[Headers], nameSpec[any], Record.FieldOrDefault(nameSpec, "suffix", false)),
        sourceColumns = Table.ColumnNames(read[Rows])
    in
        if nameAt < 0 or nameAt >= List.Count(sourceColumns) then 0
        else List.Count(List.Select(Table.Column(read[Rows], sourceColumns{nameAt}), (cell) => Text.Trim(cell) <> ""))
