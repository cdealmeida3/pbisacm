// For the answer key only (tools/powerbi/parity.ts; build B7): the first message of a Teams chat about every open case
// of each card, as tests/recorded/teams-messages.txt records them (no journal, no person chosen, the reference
// SACM-CHAT-<check>). No table reads it; the workflow Power BI evaluates it.
let
    cases = List.Select(fnCases(CheckRun, [Events = {}, Replies = {}]), (item) => item[State] = "open"),
    byCheck = fnGroupBy(cases, (item) => item[CheckId])
in
    #table(type table [CheckId = text, Chat = text],
        List.Transform(Record.FieldNames(byCheck), (id) => {id, fnChatMessage(Record.Field(byCheck, id), MessageSettings, "SACM-CHAT-" & id, "")}))
