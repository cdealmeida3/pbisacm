// Application ≠ Instance (code detector relationships/application-instance, relationship-detectors.ts; procedure 2.9,
// D180): a Business Application is a copy of its Service Instance: the same Owned by, Managed by, Operational status and
// description, and the name of the instance with "_BA" (applicationCopy of the relationship model). SACM copies the values
// itself (a SACM fix list). With several instances, the one that carries the application's name (production first).
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        columns = run[Columns],
        copy = Record.FieldOrDefault(model, "applicationCopy", null),
        words = [owned_by = "Owned by", managed_by = "Managed by", operational_status = "Operational status", description = "Description", name = "Name"],
        checks = List.Transform({"owned_by", "managed_by", "operational_status", "description", "name"}, (field) =>
            let column = if field = "operational_status" then "operationalStatus" else field in
            if (field = "description" or field = "name") and copy = null then
                [Field = field, Note = "Not tested for " & Text.Lower(Record.Field(words, field), "en-US") & ": reference data missing (applicationCopy in reference/relationship-model)."]
            else if field = "name" or List.Contains(columns, column) then [Field = field, Note = ""]
            else [Field = field, Note = "Not tested for " & fnColumnWord(field) & ": " & fnMissingColumns({field}) & "."]),
        fields = List.Transform(List.Select(checks, (entry) => entry[Note] = ""), (entry) => entry[Field]),
        fieldNotes = List.Transform(List.Select(checks, (entry) => entry[Note] <> ""), (entry) => entry[Note]),
        person = (ci as record, role as text) as nullable record => fnPerson(ci, role, columns),
        valueOf = (ci as record, field as text) as text =>
            if field = "operational_status" then (if ci[Status] = "" then "(empty)" else ci[Status])
            else if field = "description" then (let text = Text.Trim(if ci[Description] = null then "" else ci[Description]) in if text = "" then "(empty)" else text)
            else if field = "name" then ci[Name]
            else fnPersonText(person(ci, field)),
        // The description of the application is copied from its instance (D180); never when the instance has no usable one.
        descriptionDiffers = (application as record, instance as record) as logical =>
            let
                mine = if application[Description] = null then "" else application[Description],
                theirs = if instance[Description] = null then "" else instance[Description],
                source = fnLetters(theirs),
                now = fnLetters(mine),
                start = List.Max({1, copy[descriptionStart]})
            in
                if Text.Length(Text.Trim(theirs)) < copy[descriptionMin] or now = source then false
                else if now = "" or Text.Length(Text.Trim(mine)) < copy[descriptionMin] or now = fnLetters(application[Name]) or Text.StartsWith(source, now) then true
                else copy[descriptions] = "different" and Text.Start(now, start) <> Text.Start(source, start),
        applicationName = (instance as text) as text => Text.Trim(fnReplacePattern(copy[instanceSuffix], "", Text.Trim(instance), "")) & copy[applicationSuffix],
        // The Service Instance whose name the application carries ("Fines_BA" -> "Fines - PROD"), production first.
        instanceOf = (node as record, instances as list) as nullable record =>
            let
                base = fnNameKey(fnReplacePattern(ReadingRules[applicationSuffix], "i", node[Name], ""), ""),
                named = List.Select(instances, (other) => Text.StartsWith(fnNameKey(other[Name], ""), base)),
                production = List.First(List.Select(named, (other) => other[Environment] = "PROD"), null)
            in
                if List.Count(instances) = 1 then instances{0}
                else if production <> null then production
                else if List.Count(named) = 1 then named{0}
                else null,
        perCi = List.Buffer(List.Transform(inScope, (ci) =>
            let
                node = graph[NodeOf](ci),
                instances = if node[Cls] = "business_application" then fnPartners(graph, node, "child", {"service_instance", "platform"}) else {},
                instance = if List.IsEmpty(instances) then null else instanceOf(node, instances),
                theirs = if instance = null then null else instance[Ci],
                findings = if theirs = null then {} else List.RemoveNulls(List.Transform(fields, (field) =>
                    let
                        set = if field = "name" then applicationName(theirs[Name]) else valueOf(theirs, field),
                        differs =
                            if field = "operational_status" then fnNameKey(ci[Status], "") <> fnNameKey(theirs[Status], "")
                            else if field = "description" then descriptionDiffers(ci, theirs)
                            else if field = "name" then fnNameKey(ci[Name], "") <> fnNameKey(set, "")
                            else not fnSamePerson(person(ci, field), person(theirs, field)),
                        current = valueOf(ci, field),
                        word = Record.Field(words, field),
                        detail =
                            if field = "description" then "Description is not the one of its Service Instance " & instance[Name]
                            else if field = "name" then "Name is not the name of its Service Instance " & instance[Name] & " with " & copy[applicationSuffix]
                            else word & " is " & current & "; its Service Instance " & instance[Name] & " has " & set
                    in
                        if not differs then null
                        else fnFinding(pack, ci, field, detail, [Fix = [Change = "Set " & word & " (as on " & instance[Name] & ")", Current = current, Set = set]
                            & (if set <> "" and set <> "(empty)" then [Value = set] else [])])))
            in
                [Kind = if List.IsEmpty(instances) then "none" else if theirs = null then "unclear" else "compared", Findings = findings])),
        evaluated = List.Count(List.Select(perCi, (entry) => entry[Kind] = "compared")),
        unclear = List.Count(List.Select(perCi, (entry) => entry[Kind] = "unclear"))
    in
        [
            Findings = List.Buffer(List.Combine(List.Transform(perCi, (entry) => entry[Findings]))),
            Tested = List.Transform(fields, (field) => pack[id] & ":" & field),
            Evaluated = List.Transform(fields, (field) => [Part = pack[id] & ":" & field, Count = evaluated]),
            Notes = fieldNotes & (if unclear = 0 then {} else {"Partly tested: " & fnPlural(unclear, "Business Application") & " "
                & (if unclear = 1 then "has several Service Instances and none carries its" else "have several Service Instances and none carries their")
                & " name, so the instance to compare with is not known."})
        ]
