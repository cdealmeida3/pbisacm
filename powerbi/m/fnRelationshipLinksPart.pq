// The part RelationshipLinks of the table Run (D284), which the DAX table RelationshipLinks shows: the relationships of
// each CI of the newest CI report, from both ends, for the Case page: the CI above it (Parent) or below it (Child), the
// relationship type, the other CI's class and status, and whether the relationship counts (a Retired end does not; one
// excluded from calculation passes no criticality). From the relationship graph of the checks (fnRelationshipGraph), so
// a name is matched as the checks match it. `run` is CheckRun (null when no CI report is loaded).
(run as nullable record) as table =>
    let
        graph = if run = null then null else run[Graph],
        edges = if graph = null then {} else graph[Edges],
        rowOf = (edge as record, position as number, mine as record, other as record, relation as text) as list =>
            {
                mine[Key], relation, other[Name], fnClassWord(other[Cls]), if other[Ci] = null then "Not in the CI report" else other[Ci][Status], edge[Type],
                if edge[Parent][Retired] or edge[Child][Retired] then "No: a Retired end" else "Yes",
                if edge[Excluded] = true then "Yes" else "", position + 1
            },
        rows = List.Combine(List.Transform(List.Positions(edges), (position) =>
            let edge = edges{position} in
            (if edge[Parent][Ci] = null then {} else {rowOf(edge, position, edge[Parent], edge[Child], "Child")})
            & (if edge[Child][Ci] = null then {} else {rowOf(edge, position, edge[Child], edge[Parent], "Parent")})))
    in
        #table(
            type table [CiKey = text, Relation = text, Other = text, OtherClass = text, OtherStatus = text, Type = text, Counts = text, Excluded = text, Order = Int64.Type],
            rows)
