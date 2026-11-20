// The newest report file of a type (the latest report date; of one date, the file chosen by its content, D348), as a
// one-row table of ReadFiles; empty when there is none.
(kind as text) as table =>
    Table.LastN(Table.Sort(Table.SelectRows(ReadFiles, each [Kind] = kind and [Used]), {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}}), 1)
