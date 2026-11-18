// The cases of the newest report (D292), as the app works
// out its cases (src/core/cases/cases.ts, buildCases), from the findings of the newest report, the journal and the
// replies. A case is every finding of the newest report that is not parked, and every key the journal names that the
// newest report no longer shows (the team worked on it). Status (DOMAIN-RULES §17): New, Contacted, Answered (a reply
// after the last message), Fix in progress, Fixed, Not followed up (until its review date), Verified (the newest report
// contains the CI, tested the check and no longer shows the finding). State: how the case is listed, from the finding
// (a planned retirement date after today makes it wait; "Ask the owner" makes a finding to check one to solve); "" for a
// key the newest report no longer shows. Remind: "reminder" or "escalation" once ReminderFrom comes, for a case that
// was asked and did not answer (D39, D40); the measures compare ReminderFrom with today, so it is right between two
// refreshes. Every message counts as sent on the day it was recorded (the outbox is the app's, D162). `run` is CheckRun
// (null when no CI report is loaded). Read by the parts CaseLines and RepliesToRead of the table Run. `state` (build B7):
// [Events, Replies] instead of the journal and the replies of the team; the answer key gives none, to compare the
// drafts with the recorded messages (DraftsRecorded). Each case also keeps, for the drafts (fnDrafts): Fact (its
// finding), MessageEvents (its messages), ReminderDue and OverLimit (as buildCases: asked, no answer, the working days
// to the reminder passed by CaseToday, and the reminders used or not) and Askable (a line of a fix list with
// askWhenUnsure only once SACM handed it to the owner, src/app/view/fix-list.ts).
(run as nullable record, optional state as nullable record) as list =>
    let
        facts = if run = null then {} else run[Facts],
        events = if state = null then JournalEvents else state[Events],
        rules = CaseRules,
        today = Date.ToText(CaseToday, [Format = "yyyy-MM-dd", Culture = "en-US"]),
        date = if run = null then null else run[Date],
        parkedCis = if run = null or run[Parked] = null then [] else run[Parked][KeySet],
        parkedFields = if run = null or run[Parked] = null then [] else run[Parked][FieldSet],
        current = fnKeySet(List.Transform(facts, (fact) => fact[Key])),
        reportCis = fnKeySet(if run = null then {} else List.Transform(run[Cis], (ci) => ci[Key])),
        tested = fnKeySet(if run = null then {} else run[Tested]),
        // The events of each key, oldest first; the standing exceptions (no keys, for a check and a CI by name, D86).
        pairs = List.Combine(List.Transform(events, (event) => List.Transform(event[Keys], (key) => [Key = key, Event = event]))),
        byKey = fnGroupBy(pairs, (pair) => pair[Key]),
        eventsOf = (key as text) as list => List.Transform(Record.FieldOrDefault(byKey, key, {}), (pair) => pair[Event]),
        standing = List.Buffer(List.Select(events, (event) => event[Type] = "exception" and List.IsEmpty(event[Keys]) and event[CiKey] <> "")),
        covers = (event as record, checkId as text, ciKey as text) as logical =>
            (event[CheckId] = "*" or event[CheckId] = checkId)
            and (ciKey = event[CiKey] or Text.StartsWith(ciKey, event[CiKey] & "|") or Text.StartsWith(ciKey, event[CiKey] & "#")),
        order = (a as record, b as record) as number => let first = Value.Compare(a[At], b[At]) in if first <> 0 then first else Value.Compare(a[Id], b[Id]),
        repliesByRef = fnGroupBy(if state = null then ReplyItems else state[Replies], (reply) => reply[Ref]),
        todayDate = CaseToday,
        // Parts of a key: <check>:<CI key>:<field>; a CI key may hold ":" (a contract), a check id and a field never do.
        partsOf = (key as text) as record =>
            let first = Text.PositionOf(key, ":"), last = Text.PositionOf(key, ":", Occurrence.Last) in
            [CheckId = Text.Start(key, first), CiKey = Text.Middle(key, first + 1, last - first - 1), Field = Text.Middle(key, last + 1)],
        gone = List.Select(Record.FieldNames(byKey), (key) => not Record.HasFields(current, key) and Text.PositionOf(key, ":") >= 0
            and Text.PositionOf(key, ":") < Text.PositionOf(key, ":", Occurrence.Last)),
        goneFacts = List.Transform(gone, (key) => let parts = partsOf(key) in parts & [Key = key, CiName = parts[CiKey], ClassLabel = "", ContactName = "", ContactEmail = "", State = null]),
        subjects = List.Select(List.Transform(facts, (fact) => fact & [InLatest = true]) & List.Transform(goneFacts, (fact) => fact & [InLatest = false]),
            (fact) => not Record.HasFields(parkedCis, fact[CiKey]) and not Record.HasFields(parkedFields, fact[CheckId] & ":" & fact[Field])),
        exceptionWords = {"Waived", "Exception accepted", "Not followed up"},
        lastText = (timeline as list, kind as text) as text => let found = List.Last(List.Select(timeline, (event) => event[Type] = kind), null) in if found = null then "" else found[Text],
        dateOf = (value as text) as nullable date => if value = "" then null else Date.FromText(Text.Start(value, 10), [Format = "yyyy-MM-dd", Culture = "en-US"]),
        line = (fact as record) as record =>
            let
                key = fact[Key],
                own = eventsOf(key),
                covering = List.Select(standing, (event) => covers(event, fact[CheckId], fact[CiKey])),
                timeline = List.Buffer(if List.IsEmpty(covering) then own else List.Sort(own & covering, order)),
                inLatest = fact[InLatest],
                untested = not inLatest and not Record.HasFields(tested, fact[CheckId] & ":" & fact[Field]),
                // A contract is not in the CI report: the contract files are complete lists, so a contract gone from a tested check is solved.
                ciMissing = not inLatest and not Record.HasFields(reportCis, fact[CiKey]) and not Text.StartsWith(fact[CiKey], "contract:"),
                messages = List.Buffer(List.Select(timeline, (event) => event[Type] = "message")),
                lastMessage = List.Last(messages, null),
                replies = List.Buffer(List.Sort(List.Distinct(List.Combine(List.Transform(messages, (message) => Record.FieldOrDefault(repliesByRef, message[Ref], {})))),
                    (a, b) => Value.Compare(a[Received], b[Received]))),
                manual = List.Last(List.Select(timeline, (event) => event[Type] = "status" or event[Type] = "exception"), null),
                asked = if lastMessage = null then "New" else if List.AnyTrue(List.Transform(replies, (reply) => reply[Received] >= lastMessage[At])) then "Answered" else "Contacted",
                // An exception stands until a manager sets another status or its review date comes; a status stands until a later message.
                running = manual <> null and manual[Type] = "exception" and (manual[ReviewOn] = "" or manual[ReviewOn] > today),
                legacy = manual <> null and manual[Type] = "status" and List.Contains(exceptionWords, manual[Text]),
                exception = if running or legacy then manual else null,
                ended = if manual <> null and manual[Type] = "exception" and not running then manual[ReviewOn] else "",
                set = if exception <> null then "Not followed up"
                    else if manual <> null and manual[Type] = "status" and (lastMessage = null or manual[At] > lastMessage[At]) then manual[Text]
                    else asked,
                solved = not inLatest and not untested and not ciMissing,
                status = if solved and set <> "Not followed up" then "Verified" else set,
                retirements = List.Select(timeline, (event) => event[Type] = "retirement"),
                retireOn = if List.IsEmpty(retirements) then "" else List.Last(retirements)[RetireOn],
                reviewed = List.Select(timeline, (event) => event[Type] = "reviewed"),
                ownerAsked = not List.IsEmpty(reviewed) and List.Last(reviewed)[Text] = "Ask the owner",
                factState = fact[State],
                state = if factState = null then ""
                    else if factState = "open" then (if retireOn > today then "waiting" else "open")
                    else if factState = "review" then (if ownerAsked then "open" else "review")
                    else factState,
                // A case that waits for its planned retirement date gets no reminder until then.
                due = not (state = "waiting" and factState = "open"),
                assignment = List.Last(List.Select(timeline, (event) => event[Type] = "assign" or event[Type] = "handover"), null),
                sentOn = if lastMessage = null then null else dateOf(lastMessage[At]),
                closed = status = "Verified" or status = "Not followed up",
                // What the Power App offers on the case (build B6, D294).
                actions = fnCaseActions([
                    Key = key, CheckId = fact[CheckId], InLatest = inLatest, State = state, FactState = if factState = null then "" else factState, Closed = closed,
                    Status = status, Timeline = timeline, Stopped = exception <> null, RetireOn = retireOn,
                    Class = Record.FieldOrDefault(fact, "Class", ""), Mapping = Record.FieldOrDefault(fact, "Mapping", {})
                ]),
                contactId = Record.FieldOrDefault(fact, "ContactId", ""),
                reminderFrom = if sentOn = null then null else fnAddBusinessDays(sentOn, rules[ReminderDays]),
                waited = reminderFrom <> null and reminderFrom <= todayDate,
                book = Record.FieldOrDefault(CheckPlaybooks, fact[CheckId], [AskWhenUnsure = ""])
            in
                [
                    Key = key, CheckId = fact[CheckId], CiKey = fact[CiKey], CiName = fact[CiName], ClassLabel = fact[ClassLabel], Field = fact[Field],
                    ContactName = fact[ContactName], InLatest = inLatest, Untested = untested, CiMissing = ciMissing, State = state,
                    StateLabel = Record.FieldOrDefault([open = "To solve", review = "To check", waiting = "Waiting", known = "Known"], state, ""), Status = status,
                    StatusLabel = Record.FieldOrDefault([New = "New", Contacted = "Asked", Answered = "Answered", #"Fix in progress" = "In progress", Fixed = "Marked fixed",
                        #"Not followed up" = "Not followed up", Verified = "Verified"], status, status),
                    AssignedTo = if assignment = null then "" else if assignment[Type] = "assign" then assignment[Text] else assignment[To],
                    HandoverNote = if assignment = null or assignment[Type] <> "handover" then "" else assignment[Text],
                    Request = lastText(timeline, "request"), Messages = List.Count(messages), SentOn = sentOn,
                    LastMessageTo = if lastMessage = null then "" else lastMessage[To], LastRef = if lastMessage = null then "" else lastMessage[Ref],
                    ReminderFrom = reminderFrom,
                    Remind = if due and status = "Contacted" then (if List.Count(messages) <= rules[MaxReminders] then "reminder" else "escalation") else "",
                    Replies = replies, LastReplyOn = if List.IsEmpty(replies) then null else dateOf(List.Last(replies)[Received]),
                    ExceptionReason = if exception = null then "" else if legacy then "Set before version 0.12 (no reason)" else exception[Reason],
                    ReviewOn = if exception = null then null else dateOf(exception[ReviewOn]), ExceptionEnded = dateOf(ended), RetireOn = dateOf(retireOn),
                    VerifiedOn = if solved then date else null,
                    FixedBy = if status = "Fixed" and manual <> null then (if manual[ByName] <> "" then manual[ByName] else manual[By]) else "",
                    FixedOn = if status = "Fixed" and manual <> null then dateOf(manual[At]) else null, Events = List.Count(timeline),
                    // The last time a manager acted on the case (a status, an exception, a message): a reply before it is read.
                    Acted = List.Max(List.Transform(List.Select(timeline, (event) => List.Contains({"status", "exception", "message"}, event[Type])), (event) => event[At]), ""),
                    Closed = closed,
                    // Who the case is about: the user ID of the person asked, else the email in lower case (as the HTML app knows a person contacted).
                    Person = if not inLatest then "" else if contactId <> "" then contactId else Text.Lower(fact[ContactEmail], "en-US"),
                    Actions = actions[Actions], ActionWords = actions[ActionWords], Stages = actions[Stages], StageId = actions[StageId],
                    // For the drafts (build B7).
                    Fact = fact, MessageEvents = messages,
                    ReminderDue = due and status = "Contacted" and List.Count(messages) <= rules[MaxReminders] and waited,
                    OverLimit = due and status = "Contacted" and List.Count(messages) > rules[MaxReminders] and waited,
                    ToSolve = not closed and state = "open", Askable = book[AskWhenUnsure] = "" or ownerAsked
                ],
        lines = List.Buffer(List.Transform(subjects, line)),
        // Share out (build B7, D24): the manager a free group of its card goes to, "" otherwise.
        shareTo = fnShareOut(lines)
    in
        List.Buffer(List.Transform(lines, (item) => item & [ShareTo = Record.FieldOrDefault(shareTo, item[Key], "")]))
