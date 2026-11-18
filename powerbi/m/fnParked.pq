// The parked CIs of a report (src/core/checks/parked.ts, D179): the CIs of a class that is not checked yet. They give no
// line on any card and are not counted as tested; each rule of reference/parked-classes gives one grey line. Returns
// [Keys, Fields, Lines], or null when the reference file is missing (then nothing is parked, and a note says so).
(cis as list) as nullable record =>
    let
        reference = Record.FieldOrDefault(ReferenceFiles, "parked-classes", null),
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        parkedBy = (rule as record, ci as record) as logical =>
            let statuses = Record.FieldOrDefault(rule, "statuses", {}) in
            List.Contains(rule[classes], ci[Class]) and not same(ci[Status], "Retired")
                and (List.IsEmpty(statuses) or List.AnyTrue(List.Transform(statuses, (status) => same(status, ci[Status])))),
        rules = if reference = null then {} else Record.FieldOrDefault(reference, "rules", {}),
        perRule = List.Transform(rules, (rule) =>
            let
                found = List.Select(cis, (ci) => parkedBy(rule, ci)),
                count = List.Count(found),
                line = if count = 0 then Record.FieldOrDefault(rule, "none", "")
                    else if count = 1 then rule[one]
                    else Text.Replace(rule[many], "{n}", Number.ToText(count, "#,0", "en-GB"))
            in
                [Keys = List.Transform(found, (ci) => ci[Key]), Fields = Record.FieldOrDefault(rule, "fields", {}), Line = if line = null then "" else line])
    in
        if reference = null then null
        else [
            Keys = List.Distinct(List.Combine(List.Transform(perRule, (rule) => rule[Keys]))),
            Fields = List.Distinct(List.Combine(List.Transform(perRule, (rule) => rule[Fields]))),
            Lines = List.Select(List.Transform(perRule, (rule) => rule[Line]), (line) => line <> "")
        ]
