// Is the CI in the scope of a check (src/core/checks/engine.ts, runChecks)? Its class is one of scope.classes ("*": every
// class), and its status is not one of scope.exclude.operational_status. Parked CIs are left out before (fnCheckRun).
(pack as record, ci as record) as logical =>
    let
        scope = pack[scope],
        excluded = List.Transform(Record.FieldOrDefault(Record.FieldOrDefault(scope, "exclude", []), "operational_status", {}), (word) => fnNameKey(word, ""))
    in
        (List.Contains(scope[classes], "*") or List.Contains(scope[classes], ci[Class])) and not List.Contains(excluded, fnNameKey(ci[Status], ""))
