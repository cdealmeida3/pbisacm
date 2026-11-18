// The part History of the table HistoryRun (D290), which the DAX table History shows: one row per finding of one CI report
// date, with only what the history pages count (the check, the CI, its class and support group, how it is listed). The
// trends per card, class and team, new and solved between two reports and the days to fix are counted from it. `run` is
// a run of fnCheckRun.
(run as record) as table =>
    let
        facts = run[Facts]
    in
        #table(
            type table [ReportDate = date, Key = text, CheckId = text, CiKey = text, CiName = text, Class = text, ClassLabel = text, Field = text,
                State = text, SupportGroup = text, ContactName = text],
            List.Transform(facts, (fact) => {
                run[Date], fact[Key], fact[CheckId], fact[CiKey], fact[CiName], fact[Class], fact[ClassLabel], fact[Field], fact[State],
                fact[SupportGroup], fact[ContactName]}))
