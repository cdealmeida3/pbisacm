// The part Notes of the table Run (D284), which the DAX table Notes shows: why a check could not be evaluated, or only
// in part, on the newest report (D15): a detector not built in Power Query yet, a column or reference file missing, a
// report not loaded. A card with a note and nothing tested is grey, never green. Notes about the run as a whole
// (RELATIONSHIPS, PARKED, SOURCE-FIRST, Routing, Listing) have no card. `run` is CheckRun (null when no CI report is
// loaded).
(run as nullable record) as table =>
    let
        date = if run = null then null else run[Date],
        notBuilt = Table.SelectRows(ChecksRows, each not [Built]),
        reasons = Table.AddColumn(notBuilt, "Reason", each
            if [DetectorType] = "manual" then "Not tested: its lines come from the lifecycle review, which the Power BI version reads from stage 2."
            else "Not tested: this check is not built in the Power BI version yet.", type text),
        built = Table.SelectColumns(reasons, {"CheckId", "Reason"}),
        found = #table(type table [CheckId = text, Reason = text], List.Transform(if run = null then {} else run[Notes], (note) => {note[CheckId], note[Note]})),
        all = Table.Combine({built, found}),
        withDate = Table.AddColumn(all, "ReportDate", each date, type nullable date),
        numbered = Table.AddIndexColumn(withDate, "Order", 1, 1, Int64.Type)
    in
        Table.SelectColumns(numbered, {"CheckId", "ReportDate", "Reason", "Order"})
