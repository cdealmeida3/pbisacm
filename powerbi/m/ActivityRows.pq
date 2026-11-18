// Table Activity (the Activity page, D293): every event of the journal in words, newest first, as the app's Activity
// page says it (src/app/view/activity.ts, describeEvent): What it did, By who, Text (the reason, the note, how a message
// left), the cards it touched (every name up to three, else "4 cards") and the number of CIs. One line per row of the
// list: a reminder with new points is two rows (the app shows it once). Every email of the shared mailbox counts as sent
// (the outbox is the app's, D162).
let
    labels = Record.FromList(ChecksRows[CardLabel], ChecksRows[CheckId]),
    labelOf = (id as text) as text => Record.FieldOrDefault(labels, id, id),
    checkOf = (key as text) as text => let at = Text.PositionOf(key, ":") in if at < 0 then key else Text.Start(key, at),
    ciOf = (key as text) as text => let first = Text.PositionOf(key, ":"), last = Text.PositionOf(key, ":", Occurrence.Last) in
        if first < 0 or last <= first then "" else Text.Middle(key, first + 1, last - first - 1),
    months = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
    screenDate = (iso as text) as text => if Text.Length(iso) < 10 then iso
        else Text.From(Number.FromText(Text.Middle(iso, 8, 2))) & " " & months{Number.FromText(Text.Middle(iso, 5, 2)) - 1} & " " & Text.Start(iso, 4),
    longDate = (iso as text) as text => fnLongDate(Date.FromText(Text.Start(iso, 10), [Format = "yyyy-MM-dd", Culture = "en-US"])),
    reviewWords = [same = "same in EPO", different = "not the same as in EPO", #"not-in-epo" = "not in EPO"],
    stageWord = (id as text) as text => if id = "" then "" else Text.Upper(Text.Start(id, 1)) & Text.Replace(Text.Middle(id, 1), "-", " "),
    words = (event as record) as record =>
        let
            kind = event[Type]
        in
            if kind = "message" then
                (if event[Channel] = "teams" then [Icon = "teams", What = "Teams chat started with " & event[To], Text = event[Subject]]
                else [
                    Icon = if event[Kind] = "reminder" or event[Kind] = "escalation" then "remind" else "mail",
                    What = (if event[Kind] = "reminder" then "Reminder" else if event[Kind] = "escalation" then "Escalation" else "Email") & " to " & event[To] & (if event[Cc] <> "" then ", Cc " & event[Cc] else ""),
                    Text = (if event[Channel] = "outlook" then "sent from Outlook" else "sent from the shared mailbox") & " · " & event[Ref]])
            else if kind = "status" and event[Text] = "Waived" then [Icon = "stop", What = "Not followed up (before version 0.12: no reason or review date)", Text = ""]
            else if kind = "status" then [Icon = "ok", What = "Status set to " & event[Text], Text = ""]
            else if kind = "assign" then [Icon = "assign", What = if event[Text] <> "" then "Assigned to " & event[Text] else "Assignment removed", Text = ""]
            else if kind = "handover" then [Icon = "handover", What = "Handed over to " & event[To], Text = event[Text]]
            else if kind = "request" then [Icon = "file", What = "Request number " & event[Text], Text = ""]
            else if kind = "report" then [Icon = "load", What = if event[Text] <> "" then event[Text] else "Report", Text = ""]
            else if kind = "exception" then
                let again = event[Text] = "Ended by hand" in
                [Icon = "stop", What = (if again then "Followed up again" else "Not followed up") & (if event[CiName] <> "" then " for " & event[CiName] else ""),
                    Text = if again then "" else event[Reason] & (if event[ReviewOn] <> "" then "; review on " & screenDate(event[ReviewOn]) else "") & (if event[Text] <> "" then ". " & event[Text] else "")]
            else if kind = "review" then [Icon = "review", What = if event[CiKey] <> "" then "Lifecycle review: " & (if event[CiName] <> "" then event[CiName] else event[CiKey]) & " is " & Record.FieldOrDefault(reviewWords, event[Reason], event[Reason]) else "Lifecycle review started", Text = event[Text]]
            else if kind = "reviewed" then [Icon = "eye", What = if event[Text] = "Ask the owner" then "SACM checked it: the owner is asked" else "Back to SACM", Text = ""]
            else if kind = "retirement" then [Icon = "calendar", What = if event[RetireOn] <> "" then "Planned retirement date: " & longDate(event[RetireOn]) else "Planned retirement date taken away", Text = event[Text]]
            else if kind = "stage" then [Icon = "stage", What = "Mapping stage set to " & stageWord(event[Text]), Text = ""]
            else if kind = "no-process" then [Icon = "note", What = if event[Text] = "yes" then "The owner says the Business Process does not exist" else "The mark ""the process does not exist"" taken away", Text = ""]
            else if kind = "settings" then [Icon = "settings", What = "Settings changed", Text = event[Text]]
            else if kind = "person-note" then [Icon = "note", What = "Note about the person", Text = event[Text]]
            else [Icon = "note", What = "Note", Text = event[Text]],
    cardWords = (ids as list) as text => let names = List.Distinct(List.Select(List.Transform(ids, labelOf), (name) => name <> "")) in
        if List.Count(names) > 3 then Text.From(List.Count(names)) & " cards" else Text.Combine(names, ", "),
    line = (event as record) as list =>
        let
            said = words(event),
            checks = List.Transform(event[Keys], checkOf) & (if List.IsEmpty(event[Keys]) and event[CheckId] <> "" and event[CheckId] <> "*" then {event[CheckId]} else {})
        in
            {
                event[Id], DateTime.FromText(event[At], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"]), event[Type], said[Icon], said[What],
                if event[ByName] <> "" then event[ByName] else event[By], said[Text], cardWords(checks),
                List.Count(List.Distinct(List.Select(List.Transform(event[Keys], ciOf), (key) => key <> ""))), List.Count(event[Keys])
            },
    lines = List.Transform(List.Reverse(JournalEvents), line)
in
    #table(type table [Id = text, At = datetime, Type = text, Icon = text, What = text, By = text, Text = text, Cards = text, CIs = Int64.Type, Keys = Int64.Type], lines)
