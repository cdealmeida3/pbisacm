// The names of nodes, sorted, joined with ", " (src/core/checks/detectors/relationship-detectors.ts, names): a name two
// nodes share is listed twice, as there.
(nodes as list) as text => Text.Combine(List.Sort(List.Transform(nodes, (node) => node[Name]), Comparer.FromCulture("en-US")), ", ")
