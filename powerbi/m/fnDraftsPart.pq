// The part Drafts of the table Run (build B7, D300), which the DAX table Drafts shows: every message ready to send, one
// row per draft of fnDrafts (one per person across the cards, D34; a long one in parts, D36). A case is written about
// when it is to solve, a manager may ask its owner (Askable), and it was never asked, or its reminder is due, or its
// reminders got no answer (ReminderDue, OverLimit): what the Email window of the HTML app offers with "Add the points
// from other cards" ticked. Keys and NewKeys hold one key per line. Chat: the first message of a Teams chat with the
// person asked (fnChatMessage). AssignedTo: who has the cases ("Several" when they are not one manager's, "" when
// nobody has them). The Power App "SACM messages" shows the drafts and sends one when a manager presses Send (D301).
// `cases` is fnCases(CheckRun).
(cases as list) as table =>
    let
        settings = MessageSettings,
        chosen = List.Select(cases, (item) => item[InLatest] and item[ToSolve] and item[Askable] and (item[Messages] = 0 or item[ReminderDue] or item[OverLimit])),
        drafts = fnDrafts(chosen, settings),
        kindWords = [first = "Email", reminder = "Reminder", escalation = "Escalation"],
        assigned = (items as list) as text =>
            let names = List.Distinct(List.Transform(items, (item) => item[AssignedTo])) in
            if List.Count(names) = 1 then names{0} else "Several",
        row = (at as number) as list =>
            let draft = drafts{at} in
            {
                "D" & Text.PadStart(Text.From(at + 1), 4, "0"), draft[Ref], draft[Kind], Record.Field(kindWords, draft[Kind]), draft[To], draft[ToName], draft[Cc],
                draft[Subject], draft[Body], draft[Plain], fnChatMessage(draft[Items], settings, "%%REF%%", draft[To]),
                Text.Combine(draft[Keys], "#(lf)"), Text.Combine(draft[NewKeys], "#(lf)"), Text.Combine(draft[CheckIds], ", "),
                draft[CiCount], draft[PartIndex], draft[PartCount], draft[About], draft[NobodyAbove], draft[Mailbox], draft[Team], draft[Person], assigned(draft[Items])
            }
    in
        #table(
            type table [DraftId = text, Ref = text, Kind = text, KindLabel = text, To = text, ToName = text, Cc = text, Subject = text, Body = text, Plain = text,
                Chat = text, Keys = text, NewKeys = text, CheckIds = text, CiCount = Int64.Type, PartIndex = Int64.Type, PartCount = Int64.Type, About = text,
                NobodyAbove = logical, Mailbox = logical, Team = logical, Person = text, AssignedTo = text],
            List.Transform(List.Positions(drafts), row))
