// Table MappingBacklog (src/app/view/backlog.ts, D200 to D204): one line per CI to map, from the findings of the mapping
// backlog: its owner (Owned by, else who is asked), why it is on the list, its stage and the steps of its class
// (reference/mapping-backlog), the criticality lines of the same CI, and whether it can be marked "The process does not
// exist". Until the team's journal is read (build B5) every case is at the first stage of its class. Order: to solve
// first, then by name (by stage too from build B5, when a case can be past its first stage).
let
    run = CheckRun,
    config = fnReference("reference/mapping-backlog"),
    facts = if run = null or config = null then {} else run[Facts],
    columns = if run = null then {} else run[Columns],
    ciByKey = if run = null then [] else Record.FromList(run[Cis], List.Transform(run[Cis], (ci) => ci[Key])),
    packs = List.Transform(Json.Document(CheckFiles), (file) => file[pack]),
    labelOf = (id as text) as text => let pack = List.First(List.Select(packs, (candidate) => candidate[id] = id), null) in
        if pack = null then id else Record.FieldOrDefault(pack, "cardLabel", id),
    mappingChecks = List.Transform(List.Select(packs, (pack) => Record.FieldOrDefault(pack[detector], "module", "") = "mapping/backlog"), (pack) => pack[id]),
    critical = Record.FieldOrDefault(config, "criticality", {}),
    criticalFacts = List.Select(facts, (fact) => List.Contains(critical, fact[CheckId])),
    stagesFor = (cls as text) as list =>
        let
            ids = Record.FieldOrDefault(config[classStages], cls, null),
            words = Record.FieldOrDefault(Record.FieldOrDefault(config, "stageWords", []), cls, []),
            list = if ids = null then config[stages] else List.RemoveNulls(List.Transform(ids, (id) => List.First(List.Select(config[stages], (stage) => stage[id] = id), null)))
        in
            List.Transform(list, (stage) => Record.FieldOrDefault(words, stage[id], stage[label])),
    rule = Record.FieldOrDefault(config, "processMissing", null),
    order = {"open", "review", "waiting", "known"},
    stateWords = [open = "To solve", review = "To check", waiting = "Waiting", known = "Planned"],
    lines = List.Select(facts, (fact) => List.Contains(mappingChecks, fact[CheckId])),
    sorted = List.Sort(lines, (a, b) =>
        let byState = List.PositionOf(order, a[State]) - List.PositionOf(order, b[State]) in
        if byState <> 0 then byState else Comparer.FromCulture("en-US")(a[CiName], b[CiName])),
    row = (position as number) as list =>
        let
            fact = sorted{position},
            ci = Record.Field(ciByKey, fact[CiKey]),
            owner = fnPerson(ci, "owned_by", columns),
            ownerName = if owner = null then "" else if owner[Name] <> "" then owner[Name] else owner[Email],
            stages = stagesFor(fact[Class]),
            sameCi = List.Distinct(List.Transform(List.Select(criticalFacts, (other) => other[CiKey] = fact[CiKey]), (other) => labelOf(other[CheckId]))),
            canMark = rule <> null and List.Contains(rule[classes], fact[Class]) and List.AnyTrue(List.Transform(fact[Mapping], (reason) => List.Contains(rule[rules], reason)))
        in
            {
                fact[Key], fact[CiKey], fact[CiName], fact[ClassLabel], if ownerName <> "" then ownerName else fact[ContactName], Text.Replace(fact[Detail], "; ", "#(lf)"),
                Text.Combine(fact[Mapping], ", "), if List.IsEmpty(stages) then "" else stages{0}, 1, Text.Combine(stages, " → "),
                fact[State], Record.Field(stateWords, fact[State]), List.PositionOf(order, fact[State]) + 1, fact[StateWhy], Text.Combine(sameCi, ", "), canMark,
                if fact[State] <> "open" then Record.Field(stateWords, fact[State]) & ": " & fact[StateWhy] else "Invite the owner to a mapping session",
                position + 1
            }
in
    #table(
        type table [Key = text, CiKey = text, CiName = text, ClassLabel = text, Owner = text, Reasons = text, ReasonIds = text, Stage = text, StageNumber = Int64.Type,
            Steps = text, State = text, StateLabel = text, StateOrder = Int64.Type, StateWhy = text, Criticality = text, CanMarkProcessMissing = logical, NextStep = text, Order = Int64.Type],
        List.Transform(List.Positions(sorted), row))
