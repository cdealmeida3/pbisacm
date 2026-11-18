// The part Exceptions of the table Run (D292), which the DAX table Exceptions shows (the tab Not followed of the Audit
// page): every decision to stop following a finding, newest first (src/core/audit/audit.ts, exceptionLines). One line
// per case (an exception on several cases is listed once per case, because each can end on its own), and one per
// standing exception (for a check and a CI by name, entered before any finding). State: running (still in force),
// ended (the review date has passed) or closed (a manager set another status after it). CiName: the CI of the finding in
// the newest report, else the CI key of the finding. `run` is CheckRun (null when no CI report is loaded).
(run as nullable record) as table =>
    let
        facts = if run = null then {} else run[Facts],
        byKey = Record.FromList(facts, List.Transform(facts, (fact) => fact[Key])),
        today = Date.ToText(CaseToday, [Format = "yyyy-MM-dd", Culture = "en-US"]),
        isException = (event as record) as logical => event[Type] = "exception"
            or (event[Type] = "status" and List.Contains({"Waived", "Exception accepted", "Not followed up"}, event[Text])),
        // The last exception of each target, and whether a status came after it.
        steps = List.Combine(List.Transform(JournalEvents, (event) =>
            if event[Type] = "exception" and List.IsEmpty(event[Keys]) and event[CiKey] <> "" then {[Target = (if event[CheckId] = "" then "*" else event[CheckId]) & "|" & event[CiKey], Event = event, Exception = true]}
            else List.Transform(List.Select(event[Keys], (key) => isException(event) or event[Type] = "status"), (key) => [Target = key, Event = event, Exception = isException(event)]))),
        state = List.Accumulate(steps, [Last = [], After = []], (memory, step) =>
            if step[Exception] then [Last = Record.AddField(Record.RemoveFields(memory[Last], {step[Target]}, MissingField.Ignore), step[Target], step[Event]), After = Record.RemoveFields(memory[After], {step[Target]}, MissingField.Ignore)]
            else if Record.HasFields(memory[Last], step[Target]) then [Last = memory[Last], After = Record.AddField(Record.RemoveFields(memory[After], {step[Target]}, MissingField.Ignore), step[Target], true)]
            else memory),
        targets = Record.FieldNames(state[Last]),
        line = (target as text) as list =>
            let
                event = Record.Field(state[Last], target),
                standing = event[Type] = "exception" and List.IsEmpty(event[Keys]),
                legacy = event[Type] = "status",
                fact = if standing then null else Record.FieldOrDefault(byKey, target, null),
                first = Text.PositionOf(target, ":"),
                last = Text.PositionOf(target, ":", Occurrence.Last),
                keyCi = if first < 0 then target else if last > first then Text.Middle(target, first + 1, last - first - 1) else Text.Middle(target, first + 1),
                checkId = if standing then (if event[CheckId] = "" then "*" else event[CheckId]) else if fact <> null then fact[CheckId] else if first < 0 then target else Text.Start(target, first),
                ciKey = if standing then event[CiKey] else if fact <> null then fact[CiKey] else keyCi,
                ciName = if standing then (if event[CiName] <> "" then event[CiName] else event[CiKey]) else if fact <> null then fact[CiName] else keyCi,
                running = event[ReviewOn] = "" or event[ReviewOn] > today,
                words = if Record.HasFields(state[After], target) then "closed" else if running then "running" else "ended"
            in
                {
                    target, checkId, ciKey, ciName,
                    if legacy then "Set before version 0.12 (no reason)" else event[Reason], if legacy then "" else event[Text],
                    if event[ReviewOn] = "" then null else Date.FromText(event[ReviewOn], [Format = "yyyy-MM-dd", Culture = "en-US"]),
                    if event[ByName] <> "" then event[ByName] else event[By],
                    DateTime.FromText(event[At], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"]), words,
                    Record.Field([running = "Not followed up", ended = "Followed up again (review date passed)", closed = "Followed up again (a later status)"], words),
                    standing, legacy
                },
        lines = List.Transform(targets, line),
        sorted = List.Sort(lines, (a, b) =>
            let byAt = Value.Compare(b{8}, a{8}), byName = Value.Compare(a{3}, b{3}) in
            if byAt <> 0 then byAt else if byName <> 0 then byName else Value.Compare(a{0}, b{0})),
        numbered = List.Transform(List.Positions(sorted), (at) => sorted{at} & {at + 1})
    in
        #table(
            type table [Target = text, CheckId = text, CiKey = text, CiName = text, Reason = text, Note = text, ReviewOn = date, ByName = text,
                At = datetime, State = text, StateLabel = text, Standing = logical, Legacy = logical, Order = Int64.Type],
            numbered)
