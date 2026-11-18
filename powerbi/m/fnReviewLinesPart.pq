// The part ReviewLines of the table Run (D306), which the DAX table ReviewLines shows: one line per CI of each lifecycle
// review of the journal (LifecycleReviews), with its mark and the follow-up of the case it opened, as the evidence file
// of the HTML app holds it (evidenceRows of src/core/audit/lifecycle-review.ts); then the CIs a new review would draw
// from the newest report (Review "next", fnReviewDraw), which the Power App SACM audit saves on New review. Status in
// EPO: the EPO systems report of the newest CI report. Agrees: not marked yet, and EPO shows the same status (the app's
// "Mark N same"). Case status: the status of the case a "Not the same" opened; Verified once the newest report shows
// the CI in another status. EpoDate: the date of that EPO report. `run` is the run with the review lines
// (fnWithReviews), `cases` its cases (fnCases).
(run as nullable record, cases as list) as table =>
    let
        reference = fnReference("reference/lifecycle"),
        config = if reference = null then null else Record.FieldOrDefault(reference, "review", null),
        results = if config = null then {} else config[results],
        opens = if config = null then {} else config[opensCase],
        labelOf = (id as text) as text => let found = List.First(List.Select(results, (result) => result[id] = id), null) in if found = null then id else found[label],
        groupWord = [sample = "Sample by chance", #"under-retirement" = "Under retirement"],
        systems = if run = null or run[Epo] = null then [] else
            let grouped = fnGroupBy(List.Select(run[Epo][Systems], (system) => system[EpoId] <> ""), (system) => Text.Lower(Text.Trim(system[EpoId]), "en-US")) in
            Record.FromList(List.Transform(Record.FieldValues(grouped), List.Last), Record.FieldNames(grouped)),
        // The date of the EPO systems report the statuses come from: the note of "Mark N same" names it.
        epoDate = if run = null or run[Epo] = null then null else run[Epo][Date],
        epoOf = (epoId as text) as record =>
            let system = if epoId = "" then null else Record.FieldOrDefault(systems, Text.Lower(Text.Trim(epoId), "en-US"), null) in
            if system = null then [Status = "", Words = ""] else [Status = system[Status], Words = if system[Status] <> "" then system[StatusWord] & " (" & system[Status] & ")" else system[StatusWord]],
        casesByKey = Record.FromList(cases, List.Transform(cases, (item) => item[Key])),
        cis = if run = null then [] else Record.FromList(run[Cis], List.Transform(run[Cis], (ci) => ci[Key])),
        longDate = (iso as text) as text => if Text.Length(iso) < 10 then iso else fnLongDate(Date.FromText(Text.Start(iso, 10), [Format = "yyyy-MM-dd", Culture = "en-US"])),
        dateOf = (iso as text) as nullable date => if Text.Length(iso) < 10 then null else Date.FromText(Text.Start(iso, 10), [Format = "yyyy-MM-dd", Culture = "en-US"]),
        reviews = LifecycleReviews,
        newest = List.Last(reviews, null),
        line = (review as record, item as record, next as logical) as list =>
            let
                mark = if next then null else Record.FieldOrDefault(review[Marks], item[CiKey], null),
                epo = epoOf(item[EpoId]),
                opened = mark <> null and List.Contains(opens, mark[Result]),
                found = if opened then Record.FieldOrDefault(casesByKey, "LIFECYCLE-REVIEW:" & item[CiKey] & ":status", null) else null,
                ci = Record.FieldOrDefault(cis, item[CiKey], null),
                status = if found <> null then found[Status]
                    else if opened and ci <> null and ci[StatusKey] <> fnNameKey(item[Status], "") then "Verified" else "",
                sent = if found = null then {} else List.Select(found[MessageEvents], (event) => event[At] >= mark[At]),
                dates = (kind as text) as list => List.Transform(List.Select(sent, (event) => (if event[Kind] = "" then "first" else event[Kind]) = kind), (event) => Text.Start(event[At], 10))
            in
                {
                    if next then "next" else review[Id], next, not next and newest <> null and review[Id] = newest[Id], dateOf(review[Date]),
                    if next then "The next review (not started)" else "Lifecycle review of " & longDate(review[Date]),
                    review[Report], dateOf(review[ReportDate]), item[Group], Record.FieldOrDefault(groupWord, item[Group], item[Group]),
                    item[CiKey], item[Name], item[ClassLabel], item[ClassName], item[EpoId], item[Status], epo[Status], epo[Words],
                    mark = null and epo[Status] <> "" and fnNameKey(epo[Status], "") = fnNameKey(item[Status], ""),
                    if mark = null then "" else mark[Result], if mark = null then "Not checked yet" else labelOf(mark[Result]),
                    if mark = null then "" else mark[Note], if mark = null then "" else mark[ByName], if mark = null then null else dateOf(mark[At]),
                    status, List.First(dates("first"), ""), Text.Combine(dates("reminder"), " "), Text.Combine(dates("escalation"), " "), epoDate
                },
        draw = fnReviewDraw(run),
        nextReview = if draw = null then null else [Id = "next", Date = "", Report = draw[Report], ReportDate = Date.ToText(draw[ReportDate], [Format = "yyyy-MM-dd", Culture = "en-US"]), Marks = []],
        lines = List.Buffer(List.Combine(List.Transform(List.Reverse(reviews), (review) => List.Transform(review[Items], (item) => line(review, item, false))))
            & (if draw = null then {} else List.Transform(draw[Items], (item) => line(nextReview, item, true)))),
        numbered = List.Transform(List.Positions(lines), (at) => lines{at} & {at + 1})
    in
        #table(
            type table [Review = text, IsNext = logical, IsCurrent = logical, ReviewDate = nullable date, ReviewLabel = text, Report = text, ReportDate = nullable date,
                Group = text, GroupLabel = text, CiKey = text, CiName = text, ClassLabel = text, ClassName = text, EpoId = text, Status = text,
                EpoStatus = text, EpoStatusWords = text, Agrees = logical, Result = text, ResultLabel = text, Note = text, CheckedBy = text, CheckedOn = nullable date,
                CaseStatus = text, FirstMessage = text, Reminders = text, EscalatedOn = text, EpoDate = nullable date, Order = Int64.Type],
            numbered)
