// The checks on the newest CI report (fnCheckRun), worked out once per refresh; null when no CI report is loaded. Build B5
// runs them on every report date (incremental refresh); until then the tables hold the newest report only.
let
    newest = fnNewest("ci")
in
    if Table.IsEmpty(newest) then null else fnCheckRun(newest{0})
