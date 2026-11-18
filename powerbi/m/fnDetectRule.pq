// The detector of the checks of type "rule" (src/core/checks/engine.ts, runChecks and test): the condition of the check
// file (detector.when) is tested on each CI of the scope, once per entry of detector.forEach ("{each}" in the condition).
// A part the report has no column for is not tested and says so (D15). Returns [Findings, Tested, Evaluated, Notes].
(pack as record, run as record, inScope as list) as record =>
    let
        detector = pack[detector],
        when = detector[when],
        playbook = Record.FieldOrDefault(pack, "playbook", []),
        rules = ReadingRules,
        columns = run[Columns],
        squash = (value as text) as text => fnNameKey(value, ""),
        // The compared form of a CI field a rule reads (made once per CI by fnCheckRun; "" for any other field, as fnCiText).
        squashed = (ci as record, field as text) as text => Record.FieldOrDefault(ci[Squashed], field, ""),
        fill = (value as any, part as text) as any => if value is text then Text.Replace(value, "{each}", part) else value,
        isRole = (field as text) as logical => List.Contains(rules[roles], field),
        labelOf = (field as text) as text => Text.Replace(Text.Replace(field, "_", " "), ".", " "),
        isRetired = (ci as record) as logical => ci[StatusKey] = "retired",
        listOf = (value as any) as list => if value is list then value else {Text.From(value)},
        entriesOf = (value as text) as list => List.Transform(Text.SplitAny(value, ",;#(lf)"), Text.Trim),
        leaves = (condition as record) as list =>
            if Record.HasFields(condition, "all") then List.Combine(List.Transform(condition[all], @leaves))
            else if Record.HasFields(condition, "any") then List.Combine(List.Transform(condition[any], @leaves))
            else {condition},

        // How many CIs of the whole report share each value (compared form), per field; the same for live CIs per class.
        // Worked out once per run (fnCheckRun), not once per check.
        counts = run[Counts],
        classCounts = run[ClassCounts],
        // A tag as its words (a hyphen counts as a space): a mandatory-tag rule is met by one of its tags, or by a tag that ends
        // with one of its endings after a first word (src/core/checks/engine.ts, meetsTagRule).
        tagWords = (tag as text) as text => squash(Text.Replace(tag, "-", " ")),
        // The tags of a reference file in compared form, made once per check (not once per CI): by the name of the file.
        refs = List.Distinct(List.Transform(List.Select(leaves(when), (item) => Record.HasFields(item, "ref") and List.Contains({"missingTags", "tagsNotIn"}, item[op])), (item) => item[ref])),
        tagRefs = List.Accumulate(refs, [], (record, name) => Record.AddField(record, name, () =>
            let value = fnReference(name) in
            if value = null then null
            else if value is list then fnKeySet(List.Transform(value, (tag) => squash(Text.From(tag))))
            else Record.FromList(List.Transform(Record.FieldValues(value), (rules) => if rules is list
                then List.Buffer(List.Transform(rules, (rule) => rule & [Keys = List.Buffer(List.Transform(rule[oneOf], tagWords)),
                    Endings = List.Buffer(List.Transform(Record.FieldOrDefault(rule, "endsWith", {}), (ending) => " " & tagWords(ending)))])) else rules), Record.FieldNames(value)), true)),

        samePerson = (a as nullable record, b as nullable record) as logical =>
            if a = null or b = null then false
            else if a[UserId] <> "" and b[UserId] <> "" then Text.Lower(a[UserId], "en-US") = Text.Lower(b[UserId], "en-US")
            else if a[Email] <> "" and b[Email] <> "" then Text.Lower(a[Email], "en-US") = Text.Lower(b[Email], "en-US")
            else a[Email] = "" and b[Email] = "" and a[Name] <> "" and squash(a[Name]) = squash(b[Name]),

        /** Why one leaf of the condition holds for this CI, or "" when it does not. */
        leaf = (condition as record, ci as record, part as text) as text =>
            let
                op = condition[op],
                field = fill(Record.FieldOrDefault(condition, "field", part), part),
                value = fill(Record.FieldOrDefault(condition, "value", null), part),
                label = labelOf(field),
                current = fnCiText(ci, field),
                trimmed = Text.Trim(current),
                person = if isRole(field) then fnPerson(ci, field, columns) else null,
                tags = ci[TagList]
            in
                if op = "isEmpty" then
                    (if isRole(field) then (if person <> null and person[Name] = "" and person[Email] = "" then label & " is empty" else "")
                    else if trimmed = "" then label & " is empty" else "")
                else if op = "refInactive" then
                    (if person <> null and (person[Name] <> "" or person[Email] <> "") and person[Active] = false
                    then label & " is an inactive user: " & (if person[Name] <> "" then person[Name] else person[Email]) else "")
                else if op = "shorterThan" then
                    (if trimmed <> "" and Text.Length(trimmed) < Number.From(value) then label & " has only " & Text.From(Text.Length(trimmed)) & " characters" else "")
                else if op = "equalsField" then
                    (let own = squashed(ci, field) in if own <> "" and own = squashed(ci, Text.From(value)) then label & " repeats the " & Text.From(value) else "")
                else if op = "matchesAny" then
                    (if trimmed <> "" and List.AnyTrue(List.Transform(listOf(value), (pattern) => fnMatches(pattern, "i", trimmed)))
                    then label & " is a placeholder: """ & trimmed & """" else "")
                else if op = "duplicatedMoreThan" then
                    (let count = Record.FieldOrDefault(Record.FieldOrDefault(counts, field, []), squashed(ci, field), 0) in
                    if trimmed <> "" and count > Number.From(value) then "the same " & label & " is used on " & Text.From(count) & " CIs" else "")
                else if op = "duplicatedInClass" then
                    (if isRetired(ci) or trimmed = "" then ""
                    else let count = Record.FieldOrDefault(Record.FieldOrDefault(classCounts, field, []), ci[Class] & "|" & squashed(ci, field), 0) in
                    if count > Number.From(value) then "the same " & label & " is used on " & Text.From(count) & " live CIs of this class" else "")
                else if op = "hasDoubleSpaces" then
                    (if Text.Contains(current, "  ") then label & " has two or more spaces in a row" else "")
                else if op = "equals" then
                    (if squashed(ci, field) = squash(Text.From(value)) then label & " is " & current else "")
                else if op = "samePersonAs" then
                    (let other = Text.From(value) in
                    if isRole(other) and samePerson(person, fnPerson(ci, other, columns))
                    then label & " and " & Text.Replace(other, "_", " ") & " are the same person: " & (if person[Name] <> "" then person[Name] else person[Email]) else "")
                else if op = "tagMatchesAny" then
                    (let matching = List.Select(tags, (tag) => List.AnyTrue(List.Transform(listOf(value), (pattern) => fnMatches(pattern, "i", tag)))) in
                    if List.IsEmpty(matching) then "" else "tagged " & Text.Combine(matching, ", "))
                else if op = "levelsMissing" then
                    (let missing = List.Select(rules[dimensions], (dimension) => fnLevelAt(ci, field & "." & dimension) = null) in
                    if List.IsEmpty(missing) then ""
                    else if List.Count(missing) = List.Count(rules[dimensions]) then "no " & label & " criticality"
                    else "no " & label & " criticality for " & Text.Combine(missing, ", "))
                else if op = "greaterThanField" or op = "lessThanField" then
                    (let
                        left = fnLevelAt(ci, field),
                        right = fnLevelAt(ci, Text.From(value)),
                        other = Text.From(value),
                        otherWords = if Text.Contains(other, ".") then Text.BeforeDelimiter(other, ".") & " " & Text.AfterDelimiter(other, ".") else other
                    in
                        if left = null or right = null then ""
                        else if (if op = "greaterThanField" then left > right else left < right)
                        then label & " is " & fnLevelWords(left) & ", " & otherWords & " is " & fnLevelWords(right) else "")
                else if op = "lacksValidEntryFor" then
                    (let
                        dimension = Text.From(value),
                        ignore = Record.FieldOrDefault(condition, "ignore", null),
                        entries = List.Select(entriesOf(current), (entry) => Text.StartsWith(Text.Lower(entry, "en-US"), Text.Lower(dimension, "en-US")))
                    in
                        if List.AnyTrue(List.Transform(entries, (entry) => ignore = null or not fnMatches(ignore, "i", entry))) then ""
                        else if List.IsEmpty(entries) then "no justification for " & dimension
                        else "only an auto-generated justification for " & dimension)
                else if op = "onlyMatches" or op = "notOnlyMatches" then
                    (let
                        entries = List.Select(entriesOf(current), (entry) => entry <> ""),
                        only = not List.IsEmpty(entries) and List.AllTrue(List.Transform(entries, (entry) => fnMatches(Text.From(value), "i", entry)))
                    in
                        if op = "onlyMatches" then (if only then label & " holds only the automatic text" else "")
                        else if only then "" else if List.IsEmpty(entries) then label & " is empty" else label & " holds a text of its own")
                else if op = "groupInactive" then
                    (if ci[SupportGroup] <> "" and ci[SupportGroupActive] = false then "Support group " & ci[SupportGroup] & " is not active" else "")
                else if op = "hasHiddenCharacters" then
                    (if List.IsEmpty(ci[HiddenCharacters]) then "" else "the name holds a hidden character: " & Text.Combine(ci[HiddenCharacters], ", "))
                else if op = "missingTags" then
                    (let
                        ref = Record.FieldOrDefault(condition, "ref", null),
                        byClass = if ref = null then null else Record.FieldOrDefault(tagRefs, ref, null),
                        own = List.Transform(tags, tagWords),
                        wanted = if byClass = null then {} else Record.FieldOrDefault(byClass, ci[Class], {}),
                        meets = (rule as record, tag as text) as logical =>
                            List.Contains(rule[Keys], tag) or List.AnyTrue(List.Transform(rule[Endings], (ending) => Text.EndsWith(tag, ending))),
                        missing = List.Select(wanted, (rule) => not List.AnyTrue(List.Transform(own, (tag) => meets(rule, tag))))
                    in
                        if List.IsEmpty(missing) then "" else "missing tag: " & Text.Combine(List.Transform(missing, (rule) => rule[label]), ", "))
                else if op = "tagsNotIn" then
                    (let
                        ref = Record.FieldOrDefault(condition, "ref", null),
                        allowed = if ref = null then null else Record.FieldOrDefault(tagRefs, ref, null),
                        keys = ci[TagKeys],
                        unknown = List.Transform(List.Select(List.Positions(tags), (at) => allowed = null or not Record.HasFields(allowed, keys{at})), (at) => tags{at})
                    in
                        if List.IsEmpty(unknown) then "" else "tag not in the allowed list: " & Text.Combine(unknown, ", "))
                else error Error.Record("SACM.Rule", "Unknown operator """ & op & """ in " & pack[id]),

        /** Why the condition holds for this CI, or "" when it does not. */
        test = (condition as record, ci as record, part as text) as text =>
            if Record.HasFields(condition, "all") then
                let reasons = List.Transform(condition[all], (item) => @test(item, ci, part)) in
                if List.AllTrue(List.Transform(reasons, (reason) => reason <> "")) then Text.Combine(reasons, "; ") else ""
            else if Record.HasFields(condition, "any") then
                let found = List.Select(List.Transform(condition[any], (item) => @test(item, ci, part)), (reason) => reason <> "") in
                if List.IsEmpty(found) then "" else found{0}
            else leaf(condition, ci, part),

        /** The leaves that hold for this CI, in the order of the condition: the parts that made the finding. */
        holding = (condition as record, ci as record, part as text) as list =>
            List.Select(leaves(condition), (item) => leaf(item, ci, part) <> ""),

        /** The line of the SACM fix list, from the first part that holds and says what to change (engine.ts, fixLineOf). */
        fixLineOf = (condition as record, ci as record, part as text) as nullable record =>
            let
                lines = List.Transform(holding(condition, ci, part), (item) =>
                    if item[op] = "hasHiddenCharacters" then
                        [Change = "Remove the hidden character from the name", Current = fnVisibleName(ci[Name]), Set = "The same name without the hidden character", Value = fnWithoutHidden(ci[Name])]
                    else if item[op] = "duplicatedInClass" then
                        [Change = "Two records for one thing: retire one", Current = ci[Name], Set = "Retire the record that is not used (two real CIs: ask the owner)", Value = ""]
                    else if item[op] = "hasDoubleSpaces" then
                        (let set = fnSingleSpaces(ci[Name]) in [Change = "Two spaces in a row in the name", Current = ci[Name], Set = set, Value = set])
                    else if item[op] = "lacksValidEntryFor" then
                        (let dimension = fnCapital(Text.From(fill(Record.FieldOrDefault(item, "value", part), part))) in
                        [Change = "Add the justification for " & dimension & ", from the request",
                            Current = if Text.Trim(ci[ExceptionJustification]) = "" then "(empty)" else Text.Trim(ci[ExceptionJustification]), Set = "A justification for " & dimension, Value = ""])
                    else if item[op] = "levelsMissing" then
                        [Change = "Status " & ci[Status] & " without CIA values: check the status, or add the tag BIA N/A or BIA is pending",
                            Current = if ci[Status] = "" then "(empty)" else ci[Status], Set = "The right status, or the tag", Value = ""]
                    else null),
                found = List.RemoveNulls(lines)
            in
                if List.IsEmpty(found) then null else found{0},

        /** The report columns a condition needs (engine.ts, requiredColumns and columnsFor). */
        required = (condition as record, part as text) as list =>
            List.Combine(List.Transform(leaves(condition), (item) =>
                let
                    op = item[op],
                    field = fill(Record.FieldOrDefault(item, "field", part), part),
                    value = fill(Record.FieldOrDefault(item, "value", null), part),
                    own =
                        if op = "hasHiddenCharacters" then {"name.hidden"}
                        else if op = "groupInactive" then {"supportGroup", "supportGroupActive"}
                        else if op = "levelsMissing" then List.Transform(rules[dimensions], (dimension) => field & "." & dimension)
                        else if isRole(field) then {if op = "refInactive" then field & ".active" else field}
                        else {Record.FieldOrDefault(rules[columnOf], field, field)},
                    other = if (Text.EndsWith(op, "Field") or op = "samePersonAs") and value is text then {value} else {}
                in
                    own & other)),

        missingReferences = List.Select(List.Transform(List.Select(leaves(when), (item) => Record.HasFields(item, "ref")), (item) => item[ref]), (name) => fnReference(name) = null),
        parts = Record.FieldOrDefault(detector, "forEach", {""}),
        hints = rules[columnHints],

        perPart = List.Transform(parts, (part) =>
            let
                absent = List.Select(List.Distinct(required(when, part)), (column) => not List.Contains(columns, column)),
                said = List.Transform(List.Select(absent, (column) => Record.HasFields(hints, column)), (column) => Record.Field(hints, column)),
                plain = List.Select(absent, (column) => not Record.HasFields(hints, column)),
                note = "Not tested" & (if part <> "" then " for " & fnColumnWord(part) else "") & ": "
                    & Text.Combine(said & (if List.IsEmpty(plain) then {} else {fnMissingColumns(plain)}), "; ") & ".",
                classes = Record.FieldOrDefault(Record.FieldOrDefault(detector, "forEachClasses", []), part, null),
                field = if part <> "" then part else if Record.HasFields(when, "field") and when[field] <> "" then when[field] else pack[family],
                evaluated = List.Select(inScope, (ci) => classes = null or List.Contains(classes, ci[Class])),
                found = List.Buffer(List.RemoveNulls(List.Transform(evaluated, (ci) =>
                    let detail = test(when, ci, part) in
                    if detail = "" then null
                    else fnFinding(pack, ci, field, detail, [Fix = if playbook[path] = "sacm-fix" then fixLineOf(when, ci, part) else null]))))
            in
                if not List.IsEmpty(absent) then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {note}]
                else [Findings = found, Tested = {pack[id] & ":" & field}, Evaluated = {[Part = pack[id] & ":" & field, Count = List.Count(evaluated)]}, Notes = {}])
    in
        if not List.IsEmpty(missingReferences) then
            [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Skipped: reference data missing (" & Text.Combine(missingReferences, ", ") & ")."}]
        else
            [
                Findings = List.Combine(List.Transform(perPart, (out) => out[Findings])),
                Tested = List.Combine(List.Transform(perPart, (out) => out[Tested])),
                Evaluated = List.Combine(List.Transform(perPart, (out) => out[Evaluated])),
                Notes = List.Combine(List.Transform(perPart, (out) => out[Notes]))
            ]
