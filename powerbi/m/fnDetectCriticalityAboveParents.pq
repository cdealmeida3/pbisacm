// Above the parents (code detector criticality/above-parents, src/core/checks/detectors/criticality-detectors.ts): a
// Target value higher than every value the parents pass on (their Target, else their Inherited value). Parents over a
// relationship excluded from calculation do not count (D131). Each finding is first for SACM to review. Without the
// Relationship report, the Target is compared with the Inherited field.
(pack as record, run as record, inScope as list, rules as record) as record =>
    let
        columns = run[Columns],
        graph = run[Graph],
        review = "SACM checks the mapping first: a parent relationship may be missing",
        passes = (node as record, dimension as text) as nullable number =>
            if node[Ci] = null then null
            else let target = fnLevelAt(node[Ci], "target." & dimension) in if target <> null then target else fnLevelAt(node[Ci], "inherited." & dimension),
        perDimension = List.Transform(ReadingRules[dimensions], (dimension) =>
            let
                word = fnCapital(dimension),
                findings = List.Buffer(List.RemoveNulls(List.Transform(inScope, (ci) =>
                    let
                        target = fnLevelAt(ci, "target." & dimension),
                        inherited = fnLevelAt(ci, "inherited." & dimension),
                        edges = if graph = null then {} else Record.FieldOrDefault(graph[Up], ci[Key], {}),
                        counted = List.Select(edges, (edge) => edge[Excluded] <> true),
                        excluded = List.Select(edges, (edge) => edge[Excluded] = true),
                        values = List.Select(List.Transform(counted, (edge) => [Name = edge[Parent][Name], Value = passes(edge[Parent], dimension)]), (entry) => entry[Value] <> null),
                        top = List.Max(List.Transform(values, (entry) => entry[Value])),
                        highest = fnNames(List.Transform(List.Select(values, (entry) => entry[Value] = top), (entry) => entry[Name])),
                        left = List.Transform(List.Select(excluded, (edge) => passes(edge[Parent], dimension) <> null), (edge) => edge[Parent][Name]),
                        aside = if List.IsEmpty(left) then "" else ". Not counted (excluded from calculation): " & fnNames(left)
                    in
                        if target = null then null
                        else if graph = null then
                            (if inherited <> null and target > inherited
                            then fnFinding(pack, ci, dimension, word & ": Target is " & fnLevelWords(target) & ", Inherited is " & fnLevelWords(inherited), [Review = review]) else null)
                        else if List.IsEmpty(values) or target <= top then null
                        else fnFinding(pack, ci, dimension, word & ": Target is " & fnLevelWords(target) & ", higher than every parent (highest " & fnLevelWords(top)
                            & ", from " & highest & ")" & aside, [Review = review]))))
            in
                if not List.Contains(columns, "target." & dimension) then
                    [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested for " & dimension & ": " & fnMissingColumns({"target." & dimension}) & "."}]
                else if graph = null and not List.Contains(columns, "inherited." & dimension) then
                    [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested for " & dimension & ": no Relationship report, and " & fnMissingColumns({"inherited." & dimension}) & "."}]
                else [Findings = findings, Tested = {pack[id] & ":" & dimension}, Evaluated = {[Part = pack[id] & ":" & dimension, Count = List.Count(inScope)]}, Notes = {}]),
        out = fnCombineOutputs(perDimension)
    in
        if graph = null and not List.IsEmpty(out[Tested])
        then out & [Notes = out[Notes] & {"Parents not known: no Relationship report, so the Target is compared with the Inherited field. Load the Relationship report with the CI report to leave out relationships excluded from calculation."}]
        else out
