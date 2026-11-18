// The parked CIs of a report (src/core/checks/parked.ts, D179): the CIs of a class that is not checked yet. They give no
// line on any card and are not counted as tested; each rule of reference/parked-classes gives one grey line. Returns
// [Keys, Fields, Lines, KeySet, FieldSet] (the two sets: fnKeySet, made once), or null when the reference file is missing
// (then nothing is parked, and a note says so). `cis` are the CIs of fnCheckRun, with their StatusKey.
(cis as list) as nullable record =>
    let
        reference = Record.FieldOrDefault(ReferenceFiles, "parked-classes", null),
        retired = fnNameKey("Retired", ""),
        parkedBy = (classes as list, statuses as list, ci as record) as logical =>
            List.Contains(classes, ci[Class]) and ci[StatusKey] <> retired and (List.IsEmpty(statuses) or List.Contains(statuses, ci[StatusKey])),
        rules = if reference = null then {} else Record.FieldOrDefault(reference, "rules", {}),
        perRule = List.Buffer(List.Transform(rules, (rule) =>
            let
                classes = List.Buffer(rule[classes]),
                statuses = List.Buffer(List.Transform(Record.FieldOrDefault(rule, "statuses", {}), (status) => fnNameKey(status, ""))),
                found = List.Buffer(List.Select(cis, (ci) => parkedBy(classes, statuses, ci))),
                count = List.Count(found),
                line = if count = 0 then Record.FieldOrDefault(rule, "none", "")
                    else if count = 1 then rule[one]
                    else Text.Replace(rule[many], "{n}", Number.ToText(count, "#,0", "en-GB"))
            in
                [Keys = List.Transform(found, (ci) => ci[Key]), Fields = Record.FieldOrDefault(rule, "fields", {}), Line = if line = null then "" else line])),
        keys = List.Buffer(List.Distinct(List.Combine(List.Transform(perRule, (rule) => rule[Keys])))),
        fields = List.Buffer(List.Distinct(List.Combine(List.Transform(perRule, (rule) => rule[Fields]))))
    in
        if reference = null then null
        else [
            Keys = keys, Fields = fields, KeySet = fnKeySet(keys), FieldSet = fnKeySet(fields),
            Lines = List.Select(List.Transform(perRule, (rule) => rule[Line]), (line) => line <> "")
        ]
