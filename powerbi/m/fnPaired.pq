// The rows of the report of a type that goes with a CI report (fnPairedFile), as a list of records; null when there is
// none, so a check that needs it is not tested and says so.
(kind as text, date as nullable date) as nullable list =>
    let file = fnPairedFile(kind, date) in if file = null then null else file[Rows]
