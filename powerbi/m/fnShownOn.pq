// The CI a finding about a relationship is shown on (relationship-detectors.ts, shownOn): the parent when it is in the
// scope of the check, else the child; null when neither is. `scope`: a record with a field per CI key in scope.
// Returns [Ci, Other] (Other: the node at the other end).
(edge as record, scope as record) as nullable record =>
    if edge[Parent][Ci] <> null and Record.HasFields(scope, edge[Parent][Ci][Key]) then [Ci = edge[Parent][Ci], Other = edge[Child]]
    else if edge[Child][Ci] <> null and Record.HasFields(scope, edge[Child][Ci][Key]) then [Ci = edge[Child][Ci], Other = edge[Parent]]
    else null
