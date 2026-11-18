// Table JournalKeys (D291): one row per finding key of each journal event (the column Keys of the list holds them one
// per line), so an event can be found from its case and a case from its events.
let
    rows = List.Combine(List.Transform(JournalEvents, (event) => List.Transform(event[Keys], (key) =>
        {event[Id], key, let at = Text.PositionOf(key, ":") in if at < 0 then key else Text.Start(key, at), event[Type],
            DateTime.FromText(event[At], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"])})))
in
    #table(type table [EventId = text, Key = text, CheckId = text, Type = text, At = datetime], rows)
