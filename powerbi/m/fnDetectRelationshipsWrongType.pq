// Wrong relationship type (code detector relationships/wrong-type, relationship-detectors.ts): a live relationship whose
// type the model does not approve for its pair of classes, a pair the model does not allow, or the wrong direction. Shown
// on the parent when it is in scope, else the child; each relationship (parent, type, child) once. A pair the model has
// not confirmed is not checked.
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        scope = fnScopeKeys(inScope),
        live = List.Select(graph[Edges], (edge) => not edge[Parent][Retired] and not edge[Child][Retired]),
        shown = List.Buffer(List.RemoveNulls(List.Transform(live, (edge) => let at = fnShownOn(edge, scope) in if at = null then null else [Edge = edge, At = at]))),
        ruleFor = (parent as text, child as text) as nullable record =>
            List.First(List.Select(model[dictionary], (rule) => List.Contains(rule[parents], parent) and List.Contains(rule[children], child)), null),
        findingOf = (item as record) as nullable record =>
            let
                edge = item[Edge],
                at = item[At],
                rule = ruleFor(edge[Parent][Cls], edge[Child][Cls]),
                status = if rule = null then "" else rule[status],
                types = if rule = null then {} else Record.FieldOrDefault(rule, "types", {}),
                pair = fnClassWord(edge[Parent][Cls]) & " → " & fnClassWord(edge[Child][Cls]),
                sentence = edge[Parent][Name] & " " & edge[Type] & " " & edge[Child][Name],
                suffix = fnEdgeSuffix(edge),
                advice = if rule = null then null else Record.FieldOrDefault(rule, "advice", null)
            in
                if status = "allowed" and not List.AnyTrue(List.Transform(types, (allowed) => fnTypeKey(allowed) = fnTypeKey(edge[Type]))) then
                    fnFinding(pack, at[Ci], "type", pair & " as """ & edge[Type] & """: the model uses " & Text.Combine(types, " or "), [Suffix = suffix, Fix = [
                        Change = "Type of " & edge[Parent][Name] & " → " & edge[Child][Name], Current = edge[Type], Set = types{0}, Value = types{0}, RelatedTo = at[Other][Name]]])
                else if status = "blocked" then
                    fnFinding(pack, at[Ci], "pair", pair & " is not allowed: " & rule[note], [Suffix = suffix, Fix = [
                        Change = "Remove the relationship " & sentence, Current = edge[Type], Set = if advice = null then "Remove it" else advice, RelatedTo = at[Other][Name]]])
                else if status = "direction" then
                    fnFinding(pack, at[Ci], "direction", pair & ": the wrong direction. " & rule[note], [Suffix = suffix, Fix = [
                        Change = "Direction: " & sentence, Current = edge[Parent][Name] & " is the parent", Set = if advice = null then "Swap the direction" else advice, RelatedTo = at[Other][Name]]]
                        & (if Record.FieldOrDefault(rule, "review", false) = true then [Review = "Review: confirm with the criticality owner first"] else []))
                else null,
        // A relationship entered more than once gives one finding: the first.
        found = List.RemoveNulls(List.Transform(shown, findingOf)),
        grouped = fnGroupBy(found, (finding) => finding[Key]),
        findings = List.Transform(Record.FieldValues(grouped), (group) => group{0}),
        count = List.Count(shown),
        parts = {"type", "pair", "direction"}
    in
        [
            Findings = List.Buffer(findings), Tested = List.Transform(parts, (part) => pack[id] & ":" & part),
            Evaluated = List.Transform(parts, (part) => [Part = pack[id] & ":" & part, Count = count]), Notes = {}
        ]
