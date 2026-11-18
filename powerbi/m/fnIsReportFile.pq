// Report files: .csv, .xlsx and .txt (the EPO report can come as text), not the lock files Office leaves next to an open
// file ("~$name.xlsx").
(name as text) as logical =>
    let lower = Text.Lower(name, "en-US") in
    (Text.EndsWith(lower, ".csv") or Text.EndsWith(lower, ".xlsx") or Text.EndsWith(lower, ".txt")) and not Text.StartsWith(name, "~$")
