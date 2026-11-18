// The part Runs of the table HistoryRun (D290), which the DAX table Runs shows: one row per CI report date, with the file,
// its CIs and the other reports its checks used (for each type the newest report dated on or before it, as the HTML app
// pairs them). `run` is a run of fnCheckRun.
(run as record) as table =>
    #table(
        type table [ReportDate = date, FileName = text, CIs = Int64.Type, RelationshipFile = text, EpoFile = text, SolusiFile = text, ContractFile = text],
        {{run[Date], run[FileName], List.Count(run[Cis]), run[Paired][Relationship], run[Paired][Epo], run[Paired][Solusi], run[Paired][Contract]}})
