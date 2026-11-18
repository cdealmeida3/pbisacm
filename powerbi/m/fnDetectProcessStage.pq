// The stages of a Business Process in Ready (code detector process/stage, src/core/checks/detectors/process-detectors.ts,
// D197): it waits for the BIA (no CIA value yet: no line, a note says how many), is to map (CIA values, nothing live linked
// below: a case of the mapping backlog, D200, and a note here), or is mapped (CIA values and something linked below: SACM
// makes it Operational, a line here). The words and classes are processStages of reference/lifecycle.
(pack as record, run as record, inScope as list, stages as record) as record =>
    let
        graph = run[Graph],
        columns = run[Columns],
        target = List.Transform(ReadingRules[dimensions], (dimension) => "target." & dimension),
        inStatus = List.Buffer(List.Select(inScope, (ci) => fnNameKey(ci[Status], "") = fnNameKey(stages[status], ""))),
        hasCia = (ci as record) as logical => List.AnyTrue(List.Transform(ReadingRules[dimensions], (dimension) => fnLevelAt(ci, "target." & dimension) <> null)),
        below = (ci as record) as list =>
            let edges = Record.FieldOrDefault(graph[Down], ci[Key], {}) in
            List.Sort(List.Distinct(List.Transform(List.Select(edges, (edge) => List.Contains(stages[below], edge[Child][Cls])), (edge) => edge[Child][Name])), Comparer.FromCulture("en-US")),
        lines = List.Buffer(List.Transform(inStatus, (ci) => [Ci = ci, Cia = hasCia(ci), Below = if hasCia(ci) then below(ci) else {}])),
        waiting = List.Count(List.Select(lines, (line) => not line[Cia])),
        toMap = List.Count(List.Select(lines, (line) => line[Cia] and List.IsEmpty(line[Below]))),
        mapped = stages[mapped],
        say = (text as text, names as list) as text => Text.Replace(text, "{below}", Text.Combine(names, ", ")),
        count = (words as record, n as number) as text => if n = 1 then words[one] else Text.Replace(words[many], "{n}", Text.From(n)),
        findings = List.Transform(List.Select(lines, (line) => line[Cia] and not List.IsEmpty(line[Below])), (line) =>
            fnFinding(pack, line[Ci], "mapped", say(mapped[say], line[Below]), [Fix = [Change = mapped[change], Current = say(mapped[current], line[Below]), Set = mapped[set]]]))
    in
        if not List.AnyTrue(List.Transform(target, (column) => List.Contains(columns, column))) then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: " & fnMissingColumns(target) & "."}]
        else if not List.Contains(columns, "operationalStatus") then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: " & fnMissingColumns({"operationalStatus"}) & "."}]
        else if graph = null then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: no Relationship report. Load the Relationship report with the CI report."}]
        else [
            Findings = List.Buffer(findings), Tested = {pack[id]}, Evaluated = {[Part = pack[id], Count = List.Count(inStatus)]},
            Notes = (if waiting = 0 then {} else {count(stages[waits], waiting)}) & (if toMap = 0 then {} else {count(stages[toMap], toMap)})
        ]
