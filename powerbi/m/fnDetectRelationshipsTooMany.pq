// Too many partners (code detector relationships/too-many, relationship-detectors.ts): more related CIs than a rule of the
// relationship model allows (`max`), per environment of the related CI where the rule says so. SACM fixes the mapping in
// ServiceNow (D138): keep the right one, remove the other relationships.
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        rules = List.Select(fnChosenRules(pack, model[expectations]), (rule) => Record.HasFields(rule, "max")),
        perRule = List.Transform(rules, (rule) =>
            let
                perEnvironment = Record.FieldOrDefault(rule, "maxPerEnvironment", false) = true,
                title = Record.FieldOrDefault(rule, "tooManyTitle", rule[title]),
                candidates = List.Select(inScope, (ci) => List.Contains(rule[classes], graph[NodeOf](ci)[Cls])),
                findings = List.RemoveNulls(List.Transform(candidates, (ci) =>
                    let
                        found = fnPartners(graph, graph[NodeOf](ci), rule[direction], rule[related]),
                        groups = fnGroupBy(found, (other) => "env:" & (if perEnvironment then other[Environment] else "")),
                        over = List.Select(List.Zip({Record.FieldNames(groups), Record.FieldValues(groups)}), (group) => List.Count(group{1}) > rule[max]),
                        what = Text.Combine(List.Transform(over, (group) => (if perEnvironment then Text.Middle(group{0}, 4) & ": " else "") & fnSortedNames(group{1})), "; ")
                    in
                        if List.IsEmpty(over) then null
                        else fnFinding(pack, ci, rule[id], title & ": " & what, [Fix = [
                            Change = title & ": keep the right one, remove the other relationships", Current = what, Set = "Keep only the right one"]])))
            in
                [Findings = findings, Tested = {pack[id] & ":" & rule[id]}, Evaluated = {[Part = pack[id] & ":" & rule[id], Count = List.Count(candidates)]}, Notes = {}])
    in
        fnCombineOutputs(perRule)
