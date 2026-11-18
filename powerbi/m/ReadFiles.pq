// The report files the pages of the newest report use, each read once (fnReadFiles): every file dated at most ReadDays
// days before the newest file of the folder. Older files belong to the history, which reads its own days (HistoryRun,
// D290), so a folder that keeps two years of reports does not slow the refresh.
let
    newest = List.Max(List.RemoveNulls(ReportSourceFiles[ReportDate]), null)
in
    fnReadFiles(if newest = null then null else Date.AddDays(newest, -ReadDays), null)
