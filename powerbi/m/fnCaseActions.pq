// What the Power App offers on a case (build B6, D294), as the case panel of the HTML app does
// (src/app/screens/case/CasePanel.tsx; the answer key is tools/powerbi/actions.ts). `item`: Key, CheckId, InLatest, State
// (how the case is listed, "" when the newest report no longer shows it), FactState (the state of its finding), Closed,
// Status, Timeline (its events, oldest first), Stopped (it is not followed up), RetireOn (text), Class and Mapping (the
// reasons of a case of the mapping backlog). Gives Actions ("id=Label|id=Label" in the order of AppActions: the actions
// of scope line that apply), ActionWords (the labels, "Note · Status"), Stages ("id=Label|…", the stages of a case of the
// mapping backlog) and StageId (its stage: the last stage event of its class, else the first stage).
// A case the newest report no longer shows is known by its key only: Note, and Follow again when it is not followed up.
(item as record) as record =>
    let
        book = Record.FieldOrDefault(CheckPlaybooks, item[CheckId], [Kind = "owners", AskAfterReview = "", AskWhenUnsure = "", MarkWord = "fixed", RetirementDate = false]),
        config = fnReference("reference/mapping-backlog"),
        state = item[State],
        closed = item[Closed],
        timeline = item[Timeline],
        lastText = (kind as text) as text => let found = List.Last(List.Select(timeline, (event) => event[Type] = kind), null) in if found = null then "" else found[Text],
        ownerAsked = lastText("reviewed") = "Ask the owner",
        processMissing = lastText("no-process") = "yes",
        sacmFix = book[Kind] = "fix" and not (book[AskWhenUnsure] <> "" and ownerAsked),
        openWork = not closed and (state = "open" or state = "review"),
        mapping = item[InLatest] and book[Kind] = "mapping" and config <> null,
        rule = if config = null then null else Record.FieldOrDefault(config, "processMissing", null),
        canMark = mapping and rule <> null and List.Contains(rule[classes], item[Class]) and List.AnyTrue(List.Transform(item[Mapping], (reason) => List.Contains(rule[rules], reason))),
        reviewAsk = not closed and book[AskAfterReview] <> "" and state = "review",
        reviewBack = not closed and book[AskAfterReview] <> "" and state <> "review" and item[FactState] = "review",
        unsure = not closed and state = "open" and book[AskWhenUnsure] <> "",
        // The button of an askWhenUnsure line: the words after the last ": ", with a capital ("…: ask the owner" → "Ask the owner").
        unsureWords =
            let
                text = book[AskWhenUnsure],
                at = Text.PositionOf(text, ": ", Occurrence.Last),
                rest = if at < 0 then text else Text.Middle(text, at + 2)
            in
                Text.Upper(Text.Start(rest, 1), "en-GB") & Text.Middle(rest, 1),
        on = [
            note = true,
            status = openWork and not sacmFix,
            request = openWork and not sacmFix,
            assign = openWork,
            stop = openWork and not sacmFix,
            #"follow-again" = item[Stopped],
            fixed = sacmFix and not closed and state = "open" and item[Status] <> "Fixed",
            #"undo-fixed" = sacmFix and not closed and state = "open" and item[Status] = "Fixed",
            #"ask-owner" = reviewAsk or (unsure and not ownerAsked),
            #"back-to-sacm" = reviewBack or (unsure and ownerAsked),
            retirement = item[InLatest] and not closed and book[RetirementDate] and (state = "open" or item[RetireOn] <> ""),
            stage = mapping and not closed,
            #"no-process" = canMark and not closed and not processMissing,
            #"no-process-undo" = canMark and not closed and processMissing
        ],
        labelOf = (action as record) as text =>
            if action[id] = "fixed" and book[MarkWord] = "deleted" then "Deleted"
            else if action[id] = "ask-owner" and reviewAsk then book[AskAfterReview]
            else if action[id] = "ask-owner" and unsure then unsureWords
            else action[label],
        chosen = List.Select(AppActions[actions], (action) => action[scope] = "line" and Record.FieldOrDefault(on, action[id], false)),
        stages = if mapping then fnStages(config, item[Class]) else {},
        stageIds = List.Transform(stages, (stage) => stage[Id]),
        marks = List.Select(timeline, (event) => event[Type] = "stage" and List.Contains(stageIds, event[Text]))
    in
        [
            Actions = Text.Combine(List.Transform(chosen, (action) => action[id] & "=" & labelOf(action)), "|"),
            ActionWords = Text.Combine(List.Transform(chosen, labelOf), " · "),
            Stages = Text.Combine(List.Transform(stages, (stage) => stage[Id] & "=" & stage[Label]), "|"),
            StageId = if not mapping or List.IsEmpty(stages) then "" else if List.IsEmpty(marks) then stages{0}[Id] else List.Last(marks)[Text]
        ]
