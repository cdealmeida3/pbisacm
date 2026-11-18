// Table Journal (D291): every event of the list SACM Journal, oldest first (JournalEvents). Keys holds the finding keys of
// the event, one per line, as the list does; the table JournalKeys has one row per key. Day: the day of At, for the
// period of the Audit page (the table Date).
let
    dateOf = (value as text) as nullable date => if value = "" then null else Date.FromText(Text.Start(value, 10), [Format = "yyyy-MM-dd", Culture = "en-US"]),
    rows = List.Transform(JournalEvents, (event) => {
        event[Id], DateTime.FromText(event[At], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"]), dateOf(event[At]), event[By], event[ByName], if event[ByName] <> "" then event[ByName] else event[By],
        event[Type], Text.Combine(event[Keys], "#(lf)"), List.Count(event[Keys]), event[Text], event[Ref], event[To], event[Cc], event[Subject], event[Kind],
        event[Channel], event[Person], event[Reason], dateOf(event[ReviewOn]), dateOf(event[RetireOn]), event[CheckId], event[CiKey], event[CiName]})
in
    #table(
        type table [Id = text, At = datetime, Day = date, By = text, ByName = text, Who = text, Type = text, Keys = text, KeyCount = Int64.Type, Text = text, Ref = text,
            To = text, Cc = text, Subject = text, Kind = text, Channel = text, Person = text, Reason = text, ReviewOn = date, RetireOn = date,
            CheckId = text, CiKey = text, CiName = text],
        rows)
