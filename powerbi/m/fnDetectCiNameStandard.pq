// Name not standard (code detector ci/name-standard, src/core/checks/detectors/ci-detectors.ts): a name rule of the CI's
// class (reference/name-rules) is broken. The pack names the rules it applies (detector.rules).
(pack as record, run as record, inScope as list, reference as record) as record =>
    let
        wanted = Record.FieldOrDefault(pack[detector], "rules", null),
        rules = List.Select(Record.FieldOrDefault(reference, "rules", {}), (rule) => wanted = null or List.Contains(wanted, rule[id])),
        applies = (classes as nullable list, ci as record) as logical => classes = null or List.Contains(classes, "*") or List.Contains(classes, ci[Class]),
        perRule = List.Transform(rules, (rule) =>
            let
                when = Record.FieldOrDefault(rule, "when", null),
                pattern = Record.FieldOrDefault(rule, "pattern", null),
                evaluated = List.Select(inScope, (ci) => applies(Record.FieldOrDefault(rule, "classes", null), ci) and (when = null or when = "" or fnMatches(when, "", ci[Name]))),
                broken = List.Select(evaluated, (ci) =>
                    (pattern <> null and pattern <> "" and not fnMatches(pattern, "", ci[Name])) or (Record.FieldOrDefault(rule, "noOuterSpaces", false) = true and ci[NameSpaces] = true)),
                set = Record.FieldOrDefault(rule, "set", null)
            in
                [
                    Findings = List.Transform(broken, (ci) => fnFinding(pack, ci, rule[id], rule[say],
                        [Fix = if set = null then null else [Change = "Name of " & ci[Name], Current = rule[say], Set = set, Value = ""]])),
                    Tested = {pack[id] & ":" & rule[id]},
                    Evaluated = {[Part = pack[id] & ":" & rule[id], Count = List.Count(evaluated)]},
                    Notes = {}
                ])
    in
        fnCombineOutputs(perRule)
