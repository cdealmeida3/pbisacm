// The "detect data changes" of the incremental refresh of HistoryRun (D290): for one part of the history (the CI reports
// dated from `start` to `end`), the newest change of a file that its runs read (the files dated from ReadDays days
// before `start` up to `end`). The service computes a part of the last 7 days again only when this value changed, so a
// refresh after an action of the team (the journal) or after a new report recomputes no old day, or only the new one.
// The folder is listed, no file is opened. A file moved out of the folder does not change it: put the right file in.
(start as datetime, end as datetime) as datetime =>
    let
        from = Date.AddDays(DateTime.Date(start), -ReadDays),
        to = DateTime.Date(end),
        files = Table.SelectRows(ReportSourceFiles, each [ReportDate] <> null and [ReportDate] >= from and [ReportDate] < to),
        changed = List.Max(List.RemoveNulls(files[Modified]), null),
        // The samples have no time of change: the day they were recorded.
        newest = List.Max(files[ReportDate], null)
    in
        if changed <> null then changed else if newest <> null then DateTime.From(newest) else #datetime(1900, 1, 1, 0, 0, 0)
