// The mapping backlog (code detector mapping/backlog, src/core/checks/detectors/mapping-detectors.ts, D200): one line per
// CI that must be mapped, with every reason: a rule of the relationship model that reference/mapping-backlog names and
// that is not met, or a tag that says its future is decided in the mapping session. A Business Process in Ready without
// CIA values waits for the BIA (no line, D197); another CI in Ready waits (not live yet). Field "mapping"; Mapping holds
// the ids of the reasons, the detail their words.
(pack as record, run as record, inScope as list, config as record, model as record) as record =>
    let
        graph = run[Graph],
        columns = run[Columns],
        readyStatus = fnNameKey(config[readyStatus], ""),
        taggedStatus = if tagged = null then "" else fnNameKey(tagged[status], ""),
        rules = List.Select(model[expectations], (rule) => List.Contains(config[rules], rule[id]) and Record.HasFields(rule, "min")),
        tagged = Record.FieldOrDefault(config, "tagged", null),
        hasCia = (ci as record) as logical => List.AnyTrue(List.Transform(ReadingRules[dimensions], (dimension) => fnLevelAt(ci, "target." & dimension) <> null)),
        lineOf = (ci as record) as nullable record =>
            let
                node = graph[NodeOf](ci),
                ready = ci[StatusKey] = readyStatus,
                missed = List.Select(rules, (rule) => List.Contains(rule[classes], node[Cls])
                    and List.Count(fnPartners(graph, node, rule[direction], rule[related])) < rule[min]
                    and not (Record.FieldOrDefault(rule, "parentField", false) = true and List.Contains(columns, "parentService")
                        and Text.Trim(if ci[ParentService] = null then "" else ci[ParentService]) <> "")),
                isTagged = tagged <> null and List.Contains(tagged[classes], ci[Class]) and ci[StatusKey] = taggedStatus
                    and List.AnyTrue(List.Transform(ci[TagList], (tag) => List.AnyTrue(List.Transform(tagged[tags], (pattern) => fnMatches(pattern, "i", tag))))),
                ids = List.Transform(missed, (rule) => rule[id]) & (if isTagged then {tagged[id]} else {}),
                words = List.Transform(missed, (rule) => fnReplaceFirst(rule[title], "Service Instance", if node[Cls] = "platform" then "Platform" else "Service Instance"))
                    & (if isTagged then {tagged[say]} else {}),
                // A CI in Ready is not live yet, so its mapping waits; a process in Ready with CIA values is the one to map now (D197).
                waits = ready and ci[Class] <> "business_process"
            in
                if ready and ci[Class] = "business_process" and not hasCia(ci) then null
                else if List.IsEmpty(ids) then null
                else fnFinding(pack, ci, "mapping", Text.Combine(words, "; "), [Mapping = ids, InServiceNow = true]
                    & (if waits then [Wait = "Status " & ci[Status] & ": not live yet"] else [])),
        findings = List.RemoveNulls(List.Transform(inScope, lineOf))
    in
        if not List.Contains(columns, "operationalStatus") then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: " & fnMissingColumns({"operationalStatus"}) & "."}]
        else if graph = null then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: no Relationship report. Load the Relationship report with the CI report."}]
        else [Findings = List.Buffer(findings), Tested = {pack[id] & ":mapping"}, Evaluated = {[Part = pack[id] & ":mapping", Count = List.Count(inScope)]}, Notes = {}]
