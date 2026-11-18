// The checks on the newest CI report (fnCheckRun), worked out once per refresh; null when no CI report is loaded. Only the
// table Run reads it (D284). The history runs the checks on every report date in its own table HistoryRun (D290).
let
    newest = fnNewest("ci")
in
    if Table.IsEmpty(newest) then null else fnCheckRun(newest{0}, ReadFiles)
