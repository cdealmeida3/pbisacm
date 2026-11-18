// No criticality reaches the CI (code detector criticality/none-reaches, src/core/checks/detectors/criticality-detectors.ts):
// Target is not complete. Inherited set too: ServiceNow copies it to Target after two weeks, so the finding waits
// `waitDays` days after the last change of the record. Nothing inherited: the parents say why (the mapping).
(pack as record, run as record, inScope as list, rules as record) as record =>
    let
        columns = run[Columns],
        graph = run[Graph],
        date = run[Date],
        dimensions = ReadingRules[dimensions],
        absent = List.Select(List.Combine(List.Transform({"target", "inherited"}, (kind) => List.Transform(dimensions, (dimension) => kind & "." & dimension))),
            (column) => not List.Contains(columns, column)),
        passes = (node as record, dimension as text) as nullable number =>
            if node[Ci] = null then null
            else let target = fnLevelAt(node[Ci], "target." & dimension) in if target <> null then target else fnLevelAt(node[Ci], "inherited." & dimension),
        hasAny = (node as record) as logical => List.AnyTrue(List.Transform(dimensions, (dimension) => passes(node, dimension) <> null)),
        mappingWords = (ci as record) as text =>
            let
                edges = if graph = null then {} else Record.FieldOrDefault(graph[Up], ci[Key], {}),
                counted = List.Transform(List.Select(edges, (edge) => edge[Excluded] <> true), (edge) => edge[Parent]),
                excluded = List.Transform(List.Select(edges, (edge) => edge[Excluded] = true), (edge) => edge[Parent]),
                giving = List.Select(counted, hasAny),
                cut = List.Select(excluded, hasAny),
                namesOf = (nodes as list) as text => fnNames(List.Transform(nodes, (node) => node[Name]))
            in
                if graph = null then ""
                else if List.IsEmpty(counted) and List.IsEmpty(excluded) then "no parent relationship"
                else if not List.IsEmpty(giving) then "the parent " & namesOf(giving) & " has a criticality, but nothing is inherited yet"
                else if not List.IsEmpty(cut) then "only parents over a relationship excluded from calculation have a criticality: " & namesOf(cut)
                else "no parent has a criticality: " & namesOf(counted & excluded),
        findings = List.Buffer(List.RemoveNulls(List.Transform(inScope, (ci) =>
            let
                complete = List.AllTrue(List.Transform(dimensions, (dimension) => fnLevelAt(ci, "target." & dimension) <> null)),
                inherited = List.AnyTrue(List.Transform(dimensions, (dimension) => fnLevelAt(ci, "inherited." & dimension) <> null)),
                age = if ci[UpdatedOn] <> null and date <> null then Duration.Days(date - ci[UpdatedOn]) else -1,
                why = mappingWords(ci)
            in
                if complete then null
                else if inherited then
                    (if age < rules[waitDays] then fnFinding(pack, ci, "target", "Inherited is set, Target is empty", [Wait = "Inherited is set: ServiceNow copies it to Target after 2 weeks"])
                    else fnFinding(pack, ci, "target", "Inherited is set, but Target is still empty " & Text.From(age) & " days after the last change: ServiceNow did not copy it"))
                else fnFinding(pack, ci, "target", "No criticality reaches this CI" & (if why <> "" then ": " & why else "")))))
    in
        if not List.IsEmpty(absent) then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: " & fnMissingColumns(absent) & "."}]
        else [
            Findings = findings, Tested = {pack[id] & ":target"}, Evaluated = {[Part = pack[id] & ":target", Count = List.Count(inScope)]},
            Notes = if graph = null then {"Load the Relationship report with the CI report to see the parents of each CI."} else {}
        ]
