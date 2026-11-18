// The part Parked of the table Run (D284), which the DAX table Parked shows: the grey lines of the Cards page for the
// classes that are not checked yet (reference/parked-classes, D179), so nothing is hidden silently: "1 Business
// Capability in Ready is not checked yet". `run` is CheckRun (null when no CI report is loaded).
(run as nullable record) as table =>
    let
        lines = if run = null or run[Parked] = null then {} else run[Parked][Lines]
    in
        #table(type table [Line = text, Order = Int64.Type], List.Transform(List.Positions(lines), (position) => {lines{position}, position + 1}))
