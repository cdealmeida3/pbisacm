// Table Date: one row per day, from a year before the first report to a month after today.
let
    dates = List.RemoveNulls(ReportSourceFiles[ReportDate]),
    first = Date.AddDays(List.Min(dates & {SampleDate}), -365),
    last = Date.AddDays(List.Max(dates & {SampleDate, Date.From(DateTime.LocalNow())}), 31),
    days = List.Dates(first, Duration.Days(last - first) + 1, #duration(1, 0, 0, 0)),
    table = Table.FromList(days, Splitter.SplitByNothing(), type table [Date = date])
in
    Table.AddColumn(Table.AddColumn(Table.AddColumn(table, "Year", each Date.Year([Date]), Int64.Type),
        "Month", each Date.ToText([Date], [Format = "MMM yyyy", Culture = "en-GB"]), type text),
        "MonthOrder", each Date.Year([Date]) * 100 + Date.Month([Date]), Int64.Type)
