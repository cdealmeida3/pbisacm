// The checks on one CI report (src/core/checks/engine.ts, runChecks, then src/core/cases/cases.ts, buildRun): the
// reports of the other types that go with it (fnPaired), the scope of each check, the built detectors, the source first
// (D190), the parked CIs (D179), then who is asked and how each finding is listed. `file` is a row of ReadFiles.
// Returns [Date, FileName, Cis, Columns, Facts, Tested, Evaluated, Notes, Parked, Graph, Epo]; Notes are [CheckId, Note].
(file as record) as record =>
    let
        date = file[ReportDate],
        read = file[Read],
        rows = Table.ToRecords(fnReadCiReport(read)),
        found = fnCiColumns(read),
        relationships = fnPaired("relationship", date),
        epoFile = fnPairedFile("epo", date),
        epo = if epoFile = null then null else epoFile[Rows],

        // Hidden characters: the name itself, else the name as the Relationship report holds it (a CSV writes "?").
        known = if read[Lossless] or relationships = null then [] else
            let
                ends = List.Combine(List.Transform(relationships, (item) => {item[Parent], item[Child]})),
                hidden = List.Select(List.Transform(ends, (name) => [Key = fnNameKey(name, "?"), Chars = fnHiddenCharacters(name)]), (entry) => not List.IsEmpty(entry[Chars])),
                grouped = fnGroupBy(hidden, (entry) => entry[Key])
            in
                Record.FromList(List.Transform(Record.FieldValues(grouped), (entries) => List.Last(entries)[Chars]), Record.FieldNames(grouped)),
        cis = List.Buffer(List.Transform(rows, (row) =>
            let own = fnHiddenCharacters(row[Name]) in
            row & [
                TagList = if row[Tags] = "" then {} else Text.Split(row[Tags], ", "),
                HiddenCharacters = if not List.IsEmpty(own) then own else Record.FieldOrDefault(known, row[Key], {}),
                CreatedBy = if List.Contains(found, "createdBy") then row[CreatedBy] else null
            ])),
        inFile = List.AnyTrue(List.Transform(cis, (ci) => not List.IsEmpty(fnHiddenCharacters(ci[Name])))),
        hiddenFrom = if read[Lossless] or inFile then "file" else if Record.FieldCount(known) > 0 then "relationships" else "",
        columns = List.Buffer(found & (if hiddenFrom <> "" then {"name.hidden"} else {})),
        questionMarks = List.Count(List.Select(cis, (ci) => Text.Contains(ci[Name], "?"))),
        hiddenNotes =
            if hiddenFrom = "relationships" then {[CheckId = "NAME-HIDDEN-CHAR", Note = "Partly tested. A CSV report cannot show hidden characters, so only the names that are also in the Relationship report were checked."]}
            else if hiddenFrom = "" and questionMarks > 0 then {[CheckId = "NAME-HIDDEN-CHAR", Note = Text.From(questionMarks) & " names show ""?"". It can be a hidden character the CSV could not write."]}
            else {},

        model = fnReference("reference/relationship-model"),
        graph = if relationships = null or model = null then null else fnRelationshipGraph(cis, relationships, model),
        epoConfig = let config = fnReference("reference/epo-systems-report") in
            if config <> null and Record.HasFields(config, {"columns", "statuses", "roles"}) then config else null,
        // Worked out once, when a check reads it (a field of a record is worked out only when it is read).
        run = [
            Cis = cis, Columns = columns, Date = date, Graph = graph, EpoSystems = epo,
            Epo = if epoFile = null then null else [Systems = epo, Date = epoFile[ReportDate], Report = epoFile[FileName], PreviousDate = epoFile[PreviousDate]],
            EpoComparison = if epo = null or epoConfig = null then null else fnEpoCompare(cis, epo, columns, epoConfig)
        ],

        parked = fnParked(cis),
        parkedKeys = if parked = null then {} else parked[Keys],
        checkable = List.Buffer(List.Select(cis, (ci) => not List.Contains(parkedKeys, ci[Key]))),
        packs = List.Select(List.Transform(Json.Document(CheckFiles), (entry) => entry[pack]), (pack) => pack[status] <> "off"),
        moduleOf = (pack as record) as text => if pack[detector][type] = "rule" then "rule" else Record.FieldOrDefault(pack[detector], "module", pack[detector][type]),
        built = List.Select(packs, (pack) => List.Contains(BuiltDetectors, moduleOf(pack))),
        scopeOf = (pack as record) as list => List.Buffer(List.Select(checkable, (ci) => fnInScope(pack, ci))),
        skipped = (ref as text) as record => [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Skipped: reference data missing (" & ref & ")."}],
        noRelationships = [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: no Relationship report. Load the Relationship report with the CI report."}],
        relationshipDetectors = [
            #"relationships/missing" = fnDetectRelationshipsMissing, #"relationships/too-many" = fnDetectRelationshipsTooMany,
            #"relationships/wrong-type" = fnDetectRelationshipsWrongType, #"relationships/twice" = fnDetectRelationshipsTwice,
            #"relationships/application-instance" = fnDetectRelationshipsApplicationInstance,
            #"relationships/offering-owner" = fnDetectRelationshipsOfferingOwner, #"relationships/offering-parent" = fnDetectRelationshipsOfferingParent
        ],
        detect = (pack as record) as record =>
            let
                module = moduleOf(pack),
                inScope = scopeOf(pack),
                ref = Record.FieldOrDefault(pack[detector], "ref",
                    if Text.StartsWith(module, "criticality/") then "reference/criticality"
                    else if Text.StartsWith(module, "relationships/") then "reference/relationship-model"
                    else if module = "process/stage" then "reference/lifecycle"
                    else if module = "mapping/backlog" then "reference/mapping-backlog"
                    else ""),
                reference = fnReference(ref),
                criticality = reference <> null and Value.Is(Record.FieldOrDefault(reference, "waitDays", null), type number),
                isModel = (value as any) as logical => value <> null and Value.Is(Record.FieldOrDefault(value, "dictionary", null), type list)
                    and Value.Is(Record.FieldOrDefault(value, "expectations", null), type list),
                stages = if reference = null then null else Record.FieldOrDefault(reference, "processStages", null)
            in
                if module = "rule" then fnDetectRule(pack, run, inScope)
                else if Record.HasFields(relationshipDetectors, module) then
                    (if not isModel(reference) then skipped(ref) else if graph = null then noRelationships
                    else Record.Field(relationshipDetectors, module)(pack, run, inScope, reference))
                else if module = "epo/differs" or module = "epo/not-arrived" then
                    (if epoConfig = null then skipped("reference/epo-systems-report")
                    else if epo = null then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: no EPO systems report. Load the EPO systems report with the CI report."}]
                    else if not List.Contains(columns, "assetTag") then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the CI report has no column for the EPO ID (asset_tag)."}]
                    else if module = "epo/differs" then fnDetectEpoDiffers(pack, run, epoConfig) else fnDetectEpoNotArrived(pack, run, epoConfig))
                else if module = "process/stage" then
                    (if stages = null then skipped(ref & ", processStages") else fnDetectProcessStage(pack, run, inScope, stages))
                else if module = "mapping/backlog" then
                    (if reference = null or not Value.Is(Record.FieldOrDefault(reference, "rules", null), type list) then skipped(ref)
                    else if not (model <> null and Value.Is(Record.FieldOrDefault(model, "expectations", null), type list)) then skipped("reference/relationship-model")
                    else fnDetectMappingBacklog(pack, run, inScope, reference, model))
                else if module = "ci/name-standard" then (if reference = null then skipped(ref) else fnDetectCiNameStandard(pack, run, inScope, reference))
                else if module = "ci/epo-id" then (if reference = null then skipped(ref) else fnDetectCiEpoId(pack, run, inScope, reference))
                else if module = "ci/status-age" then (if reference = null then skipped(ref) else fnDetectCiStatusAge(pack, run, inScope, reference))
                else if module = "criticality/above-parents" then (if not criticality then skipped(ref) else fnDetectCriticalityAboveParents(pack, run, inScope, reference))
                else if module = "criticality/none-reaches" then (if not criticality then skipped(ref) else fnDetectCriticalityNoneReaches(pack, run, inScope, reference))
                // A module listed in BuiltDetectors that has no branch here: never a silent pass (D15).
                else [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the detector " & module & " is listed as built, but fnCheckRun does not run it."}],
        outputs = List.Buffer(List.Transform(built, (pack) => let out = detect(pack) in out & [Notes = List.Transform(out[Notes], (note) => [CheckId = pack[id], Note = note])])),
        combined = fnCombineOutputs(outputs),

        // The relationship graph says once what it could not match (as the first check that builds it).
        usesGraph = List.AnyTrue(List.Transform(built, (pack) => let module = moduleOf(pack) in
            Text.StartsWith(module, "criticality/") or Text.StartsWith(module, "relationships/") or module = "process/stage" or module = "mapping/backlog")),
        graphNotes = if graph = null or not usesGraph then {} else
            (if graph[Unmatched] > 0 then {[CheckId = "RELATIONSHIPS", Note = Text.From(graph[Unmatched]) & " relationship " & (if graph[Unmatched] = 1 then "end is" else "ends are")
                & " not in the CI report. They count by the class of the Relationship report, and their status is not known."]} else {})
            & (if graph[Ambiguous] > 0 then {[CheckId = "RELATIONSHIPS", Note = Text.From(graph[Ambiguous]) & " relationship ends name a CI that two CIs share, and neither class nor asset tag told them apart. The first was used."]} else {}),

        source = fnSourceFirst(combined[Findings], run, packs),
        parkedFields = if parked = null then {} else parked[Fields],
        kept = List.Buffer(List.Select(source[Findings], (finding) => not List.Contains(parkedFields, finding[CheckId] & ":" & finding[Field]) and not List.Contains(parkedKeys, finding[CiKey]))),
        parkedNotes = if parked = null then {[CheckId = "PARKED", Note = "Parked classes: reference data missing (reference/parked-classes), so every class is checked."]} else {},

        // Where the fix is made and how findings are listed: never silent when the reference data is missing.
        synced = fnReference("reference/epo-synced-classes"),
        offeringClasses = if synced = null then {} else Record.FieldOrDefault(Record.FieldOrDefault(synced, "offerings", []), "classes", {}),
        blind = if List.Contains(found, "createdBy") then 0 else List.Count(List.Select(cis, (ci) => List.Contains(offeringClasses, ci[Class]))),
        routingNotes =
            if synced = null then {[CheckId = "Routing", Note = "reference data missing (reference/epo-synced-classes), so no finding is routed to EPO."]}
            else if blind > 0 then {[CheckId = "Routing", Note = "the report has no Created by column (sys_created_by), so " & Text.From(blind)
                & " Service Offerings count as made by a person: they are fixed in ServiceNow, not in EPO."]}
            else {},
        listingNotes =
            (if fnReference("reference/not-live-statuses") = null then {[CheckId = "Listing", Note = "reference data missing (reference/not-live-statuses), so findings on CIs that are not live yet are shown as to solve."]} else {})
            & (if fnReference("reference/known-tags") = null then {[CheckId = "Listing", Note = "reference data missing (reference/known-tags), so findings a tag explains are shown as to solve."]} else {})
    in
        [
            Date = date, FileName = file[FileName], Cis = cis, Columns = columns,
            Facts = List.Buffer(fnFacts(kept, run, packs)),
            Tested = combined[Tested], Evaluated = combined[Evaluated],
            Notes = graphNotes & combined[Notes] & source[Notes] & parkedNotes & routingNotes & listingNotes & hiddenNotes,
            Parked = parked, Graph = graph, Epo = run[Epo]
        ]
