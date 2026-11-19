// For the answer key only (tools/powerbi/parity.ts; build D4, D314): the emails of the samples as DraftsRecorded makes
// them, but with at most 2 CIs per message and 2 lines per table, so that the joined parts of a long message and the
// attached file are compared too, with tests/recorded/emails/split/ (tests/sample-record.ts). No table reads it.
let
    run = CheckRun,
    cases = List.Select(fnCases(run, [Events = {}, Replies = {}]), (item) => item[State] = "open"),
    settings = MessageSettings & [MaxCis = 2, RowsInEmail = 2],
    drafts = fnDrafts(cases, settings),
    emails = List.Buffer(fnEmailTemplate(drafts, settings))
in
    #table(type table [Keys = text, PartIndex = Int64.Type, PartCount = Int64.Type, Html = text, Csv = text, Summary = text, EmailSubject = text, First = Int64.Type],
        List.Transform(List.Positions(drafts), (at) => let draft = drafts{at}, email = emails{at} in
            {Text.Combine(draft[Keys], " "), draft[PartIndex], draft[PartCount], email[Html], email[Csv], email[Summary], email[Subject], email[First]}))
