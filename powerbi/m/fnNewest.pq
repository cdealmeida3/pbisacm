// The newest report file of a type (the latest report date, then the last file name), as a one-row table of ReadFiles;
// empty when there is none.
(kind as text) as table =>
    Table.LastN(Table.Sort(Table.SelectRows(ReadFiles, each [Kind] = kind), {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}}), 1)
