// The part Drafts of the table Run (build B7, D300), which the DAX table Drafts shows: every message ready to send, one
// row per draft of fnDrafts (one per person across the cards, D34; a long one in parts, D36). A case is written about
// when it is to solve, a manager may ask its owner (Askable), and it was never asked, or its reminder is due, or its
// reminders got no answer (ReminderDue, OverLimit): what the Email window of the HTML app offers with "Add the points
// from other cards" ticked. Keys and NewKeys hold one key per line. Chat: the first message of a Teams chat with the
// person asked (fnChatMessage). AssignedTo: who has the cases ("Several" when they are not one manager's, "" when
// nobody has them). FreeKeys: the keys nobody has, which become the sender's when the message goes (D164). Html, Csv,
// Summary and EmailSubject: the email of fnEmailTemplate (D313, D314), on the first part of a message; "" on its other
// parts, which are in that email. EmailId: the DraftId of the draft that holds the email (its own on a first part).
// AddressSetting and AddressWhy (build R6, D373): when a draft has no To, the Title of SACM Settings that would give it
// one (procurementEmail, team.<id>.people, epoOwnerEmail; "" for a person or an escalation nobody is known for), and why
// in words, for the list of Messages and the app. The Power App "SACM messages" shows the drafts and sends one when a
// manager presses Send (D301).
// `cases` is fnCases(CheckRun).
(cases as list) as table =>
    let
        settings = MessageSettings,
        // The check files read once for every chat (ARCHITECTURE §12, the speed rules).
        packs = List.Buffer(List.Transform(Json.Document(CheckFiles), (file) => file[pack])),
        chosen = List.Select(cases, (item) => item[InLatest] and item[ToSolve] and item[Askable] and (item[Messages] = 0 or item[ReminderDue] or item[OverLimit])),
        drafts = fnDrafts(chosen, settings),
        emails = List.Buffer(fnEmailTemplate(drafts, settings)),
        idOf = (at as number) as text => "D" & Text.PadStart(Text.From(at + 1), 4, "0"),
        kindWords = [first = "Email", reminder = "Reminder", escalation = "Escalation"],
        epoOwnerId = ReadingRules[epoOwner][id],
        // The setting that gives a draft its To, and why it has none (D373).
        addressOf = (draft as record) as list =>
            let
                person = draft[Person],
                setting =
                    if draft[To] <> "" or draft[NobodyAbove] then ""
                    else if draft[Mailbox] then "procurementEmail"
                    else if Text.StartsWith(person, "team:") then "team." & Text.Middle(person, 5) & ".people"
                    else if person = epoOwnerId then "epoOwnerEmail"
                    else "",
                why =
                    if draft[To] <> "" then ""
                    else if draft[NobodyAbove] then "Nobody is known above " & draft[About] & ": type the address of who gets the escalation in To."
                    else if setting <> "" then "No address: add " & setting & " to SACM Settings, or type it in To."
                    else "No address: " & draft[ToName] & " has no email in the CI report. Type it in To."
            in
                {setting, why},
        assigned = (items as list) as text =>
            let names = List.Distinct(List.Transform(items, (item) => item[AssignedTo])) in
            if List.Count(names) = 1 then names{0} else "Several",
        row = (at as number) as list =>
            let draft = drafts{at}, email = emails{at} in
            {
                idOf(at), draft[Ref], draft[Kind], Record.Field(kindWords, draft[Kind]), draft[To], draft[ToName], draft[Cc],
                draft[Subject], draft[Body], draft[Plain], fnChatMessage(draft[Items], settings, "%%REF%%", draft[To], packs),
                Text.Combine(draft[Keys], "#(lf)"), Text.Combine(draft[NewKeys], "#(lf)"), Text.Combine(draft[CheckIds], ", "),
                draft[CiCount], draft[PartIndex], draft[PartCount], draft[About], draft[NobodyAbove], draft[Mailbox], draft[Team], draft[Person], assigned(draft[Items]),
                Text.Combine(List.Transform(List.Select(draft[Items], (item) => item[AssignedTo] = ""), (item) => item[Key]), "#(lf)"),
                email[Html], email[Csv], email[Summary], email[Subject], idOf(email[First])
            } & addressOf(draft)
    in
        #table(
            type table [DraftId = text, Ref = text, Kind = text, KindLabel = text, To = text, ToName = text, Cc = text, Subject = text, Body = text, Plain = text,
                Chat = text, Keys = text, NewKeys = text, CheckIds = text, CiCount = Int64.Type, PartIndex = Int64.Type, PartCount = Int64.Type, About = text,
                NobodyAbove = logical, Mailbox = logical, Team = logical, Person = text, AssignedTo = text,
                FreeKeys = text, Html = text, Csv = text, Summary = text, EmailSubject = text, EmailId = text,
                AddressSetting = text, AddressWhy = text],
            List.Transform(List.Positions(drafts), row))
