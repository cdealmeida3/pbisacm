// The part DataColumns of the table Run (build R3), which the DAX table DataColumns of the page Data check shows: each
// column of the CI report that the checks and the emails read (ReadingRules[wantedColumns], WANTED_COLUMNS of
// src/core/sources/ci/ci-report.ts, D347), in its order, by its ServiceNow field name, and whether the newest CI report
// has it (State: Found or Missing). No rows when no CI report is loaded. `run` is CheckRun.
(run as nullable record) as table =>
    let
        wanted = ReadingRules[wantedColumns],
        columns = if run = null then {} else run[Columns]
    in
        #table(
            type table [Order = Int64.Type, Field = text, State = text],
            if run = null then {} else List.Transform(List.Positions(wanted), (at) => {at + 1, wanted{at}[field], if List.Contains(columns, wanted{at}[column]) then "Found" else "Missing"}))
