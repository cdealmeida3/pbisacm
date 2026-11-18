// The live CIs on the other end of a node's relationships, in one direction ("parent": above it, "child": below it), of
// some classes, each once, in the order of the Relationship report (relationship-detectors.ts, partners).
(graph as record, node as record, direction as text, classes as list) as list =>
    let
        edges = Record.FieldOrDefault(if direction = "parent" then graph[Up] else graph[Down], node[Key], {}),
        others = List.Select(List.Transform(edges, (edge) => if direction = "parent" then edge[Parent] else edge[Child]), (other) => List.Contains(classes, other[Cls])),
        grouped = fnGroupBy(others, (other) => other[Key])
    in
        List.Transform(Record.FieldValues(grouped), (group) => List.Last(group))
