// For the answer key only (tools/powerbi/parity.ts; build B7): the drafts of the samples as tests/recorded/messages.txt
// records them, with no journal and no replies, every open case written about (tests/sample-record.ts). No table reads
// it; the workflow Power BI evaluates it and compares it with the recorded messages byte for byte, the references and
// the name of the manager put in.
let
    run = CheckRun,
    cases = List.Select(fnCases(run, [Events = {}, Replies = {}]), (item) => item[State] = "open"),
    drafts = fnDrafts(cases, MessageSettings)
in
    #table(type table [Ref = text, Kind = text, To = text, Cc = text, Subject = text, Keys = text, NewKeys = text, PartIndex = Int64.Type, PartCount = Int64.Type, CiCount = Int64.Type, CheckIds = text, Plain = text, Body = text],
        List.Transform(drafts, (draft) => {draft[Ref], draft[Kind], draft[To], draft[Cc], draft[Subject], Text.Combine(draft[Keys], " "), Text.Combine(draft[NewKeys], " "),
            draft[PartIndex], draft[PartCount], draft[CiCount], Text.Combine(draft[CheckIds], " "), draft[Plain], draft[Body]}))
