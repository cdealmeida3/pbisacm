// The part MappingBacklog of the table Run (D284), which the DAX table MappingBacklog shows (src/app/view/backlog.ts, D200 to D204): one line per CI to map, from the findings of the
// mapping backlog: its owner (Owned by, else who is asked), why it is on the list, its stage and the steps of its class
// (reference/mapping-backlog), the criticality lines of the same CI, and whether it can be marked "The process does not
// exist". The stage is the one a manager set in the journal (from build B6 the Power App sets it; StageId of the cases),
// else the first stage of the class. Order: to solve first, then by stage, then by name. `run` is CheckRun (null when
// no CI report is loaded); `cases` is fnCases(run).
(run as nullable record, cases as list) as table =>
    let
        config = fnReference("reference/mapping-backlog"),
        facts = if run = null or config = null then {} else run[Facts],
        columns = if run = null then {} else run[Columns],
        ciByKey = if run = null then [] else Record.FromList(run[Cis], List.Transform(run[Cis], (ci) => ci[Key])),
        packs = List.Buffer(List.Transform(Json.Document(CheckFiles), (file) => file[pack])),
        labelOf = (id as text) as text => let pack = List.First(List.Select(packs, (candidate) => candidate[id] = id), null) in
            if pack = null then id else Record.FieldOrDefault(pack, "cardLabel", id),
        mappingChecks = List.Buffer(List.Transform(List.Select(packs, (pack) => Record.FieldOrDefault(pack[detector], "module", "") = "mapping/backlog"), (pack) => pack[id])),
        critical = Record.FieldOrDefault(config, "criticality", {}),
        // The criticality lines by CI, grouped once (not looked for again for each line).
        criticalByCi = fnGroupBy(List.Select(facts, (fact) => List.Contains(critical, fact[CheckId])), (fact) => fact[CiKey]),
        stagesFor = (cls as text) as list => fnStages(config, cls),
        stageIds = Record.FromList(List.Transform(cases, (item) => item[StageId]), List.Transform(cases, (item) => item[Key])),
        // The place of the stage of a line in the steps of its class, from 0.
        stageAt = (fact as record) as number =>
            let ids = List.Transform(stagesFor(fact[Class]), (stage) => stage[Id]), at = List.PositionOf(ids, Record.FieldOrDefault(stageIds, fact[Key], ""))
            in if at < 0 then 0 else at,
        rule = Record.FieldOrDefault(config, "processMissing", null),
        order = {"open", "review", "waiting", "known"},
        stateWords = [open = "To solve", review = "To check", waiting = "Waiting", known = "Planned"],
        lines = List.Select(facts, (fact) => List.Contains(mappingChecks, fact[CheckId])),
        // Buffered: each row reads it by position, and a lazy sorted list would be sorted again for each row.
        staged = List.Transform(lines, (fact) => [Fact = fact, At = stageAt(fact)]),
        sorted = List.Buffer(List.Transform(List.Sort(staged, (a, b) =>
            let byState = List.PositionOf(order, a[Fact][State]) - List.PositionOf(order, b[Fact][State]), byStage = a[At] - b[At] in
            if byState <> 0 then byState else if byStage <> 0 then byStage else Comparer.FromCulture("en-US")(a[Fact][CiName], b[Fact][CiName])), (line) => line[Fact] & [StageAt = line[At]])),
        row = (position as number) as list =>
            let
                fact = sorted{position},
                ci = Record.Field(ciByKey, fact[CiKey]),
                owner = fnPerson(ci, "owned_by", columns),
                ownerName = if owner = null then "" else if owner[Name] <> "" then owner[Name] else owner[Email],
                stages = stagesFor(fact[Class]),
                sameCi = List.Distinct(List.Transform(Record.FieldOrDefault(criticalByCi, fact[CiKey], {}), (other) => labelOf(other[CheckId]))),
                canMark = rule <> null and List.Contains(rule[classes], fact[Class]) and List.AnyTrue(List.Transform(fact[Mapping], (reason) => List.Contains(rule[rules], reason)))
            in
                {
                    fact[Key], fact[CiKey], fact[CiName], fact[ClassLabel], if ownerName <> "" then ownerName else fact[ContactName], Text.Replace(fact[Detail], "; ", "#(lf)"),
                    Text.Combine(fact[Mapping], ", "), if List.IsEmpty(stages) then "" else stages{fact[StageAt]}[Label], fact[StageAt] + 1,
                    Text.Combine(List.Transform(stages, (stage) => stage[Label]), " → "),
                    fact[State], Record.Field(stateWords, fact[State]), List.PositionOf(order, fact[State]) + 1, fact[StateWhy], Text.Combine(sameCi, ", "), canMark,
                    if fact[State] <> "open" then Record.Field(stateWords, fact[State]) & ": " & fact[StateWhy] else "Invite the owner to a mapping session",
                    position + 1
                }
    in
        #table(
            type table [Key = text, CiKey = text, CiName = text, ClassLabel = text, Owner = text, Reasons = text, ReasonIds = text, Stage = text, StageNumber = Int64.Type,
                Steps = text, State = text, StateLabel = text, StateOrder = Int64.Type, StateWhy = text, Criticality = text, CanMarkProcessMissing = logical, NextStep = text, Order = Int64.Type],
            List.Transform(List.Positions(sorted), row))
