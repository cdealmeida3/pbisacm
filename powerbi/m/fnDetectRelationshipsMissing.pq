// Relationship missing (code detector relationships/missing, src/core/checks/detectors/relationship-detectors.ts): fewer
// related CIs than a rule of the relationship model asks (`min`), in the direction of the rule. A Service Offering whose
// Parent field already names its service is not raised for a rule with `parentField`: Offering parent lists it for SACM.
// A rule that is not agreed (`review`) is listed for a review.
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        columns = run[Columns],
        rules = List.Select(fnChosenRules(pack, model[expectations]), (rule) => Record.HasFields(rule, "min")),
        perRule = List.Transform(rules, (rule) =>
            let
                candidates = List.Select(inScope, (ci) => List.Contains(rule[classes], graph[NodeOf](ci)[Cls])),
                parentField = Record.FieldOrDefault(rule, "parentField", false) = true and List.Contains(columns, "parentService"),
                findings = List.RemoveNulls(List.Transform(candidates, (ci) =>
                    let
                        node = graph[NodeOf](ci),
                        found = List.Count(fnPartners(graph, node, rule[direction], rule[related])),
                        review = if Record.FieldOrDefault(rule, "review", false) = true then [Review = let why = Record.FieldOrDefault(rule, "reviewWhy", "") in if why <> "" then why else "Review only"] else [],
                        here = if Record.FieldOrDefault(rule, "inServiceNow", false) = true then [InServiceNow = true] else []
                    in
                        if found >= rule[min] then null
                        else if parentField and Text.Trim(if ci[ParentService] = null then "" else ci[ParentService]) <> "" then null
                        else fnFinding(pack, ci, rule[id], fnReplaceFirst(rule[title], "Service Instance", if node[Cls] = "platform" then "Platform" else "Service Instance"), review & here)))
            in
                [Findings = findings, Tested = {pack[id] & ":" & rule[id]}, Evaluated = {[Part = pack[id] & ":" & rule[id], Count = List.Count(candidates)]}, Notes = {}])
    in
        fnCombineOutputs(perRule)
