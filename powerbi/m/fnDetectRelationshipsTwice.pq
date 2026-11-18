// Relationship entered twice (code detector relationships/twice, relationship-detectors.ts): between two CIs only one
// relationship is allowed. Rows with the same parent, type and child, and also rows of another type or the other
// direction between the same two CIs. Only live relationships count (a Retired end is another card). Shown on the parent
// when it is in scope, else the child.
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        scope = fnScopeKeys(inScope),
        ends = List.Select(graph[Edges], (edge) => edge[Parent][Key] <> edge[Child][Key]),
        pairs = fnGroupBy(ends, (edge) => Text.Combine(List.Sort({edge[Parent][Key], edge[Child][Key]}, Comparer.Ordinal), "<>")),
        findingOf = (pair as text, list as list) as nullable record =>
            let
                first = list{0},
                at = fnShownOn(first, scope),
                count = List.Count(list),
                // One kind per parent, type and child, in the order of the report.
                bySuffix = fnGroupBy(list, fnEdgeSuffix),
                kinds = List.Transform(Record.FieldValues(bySuffix), (group) => group{0}[Parent][Name] & " " & group{0}[Type] & " " & group{0}[Child][Name]),
                a = first[Parent][Name],
                b = first[Child][Name]
            in
                if count < 2 or first[Parent][Retired] or first[Child][Retired] or at = null then null
                else if List.Count(kinds) = 1 then
                    fnFinding(pack, at[Ci], "twice", "Entered " & Text.From(count) & " times: " & kinds{0}, [Suffix = fnEdgeSuffix(first), Fix = [
                        Change = "Relationship entered " & Text.From(count) & " times: " & kinds{0}, Current = Text.From(count) & " rows", Set = "Keep one", RelatedTo = at[Other][Name]]])
                else
                    fnFinding(pack, at[Ci], "twice", Text.From(count) & " relationships between " & a & " and " & b & ": " & Text.Combine(kinds, "; "), [Suffix = pair, Fix = [
                        Change = Text.From(count) & " relationships between " & a & " and " & b & ": only one is allowed", Current = Text.Combine(kinds, "; "),
                        Set = "Keep only the right one", RelatedTo = at[Other][Name]]]),
        findings = List.RemoveNulls(List.Transform(Record.FieldNames(pairs), (pair) => findingOf(pair, Record.Field(pairs, pair))))
    in
        [Findings = List.Buffer(findings), Tested = {pack[id] & ":twice"}, Evaluated = {[Part = pack[id] & ":twice", Count = List.Count(inScope)]}, Notes = {}]
