// The team settings the messages use (build B7, D300), from the list SACM Settings, with the defaults of the HTML app
// (src/app/state/store.ts, DEFAULT_SETTINGS): the Service Portal, the signature, the EPO inventory owner, the
// Procurement mailbox and its lead, the name and link of each request of the portal, and the people of each team of
// reference/record-teams. One row per setting: Title is the key, Value the value. The keys: portalLink, signature,
// epoOwnerName, epoOwnerEmail, procurementName, procurementEmail, procurementLeadName, procurementLeadEmail,
// request.<id>.name and request.<id>.link (the ids of MessageWords[requests]), team.<id>.name and team.<id>.people
// ("Name <address>; Name <address>", one person per part), and rowsInEmail: the lines a table of an email shows before
// "and N more in the attached file" (D314; a whole number in its range of SettingRanges, else the default 10). A key
// that is not there, or empty, keeps its default. The
// manager who sends is not a setting: the Power App puts their name in the draft (%%SENDER%%, fnDrafts).
let
    // A Title typed twice: the last row counts (as the HTML app reads its settings); an empty Title is left out.
    rows = List.Select(Table.ToRecords(fnStateList("settings")), (row) => row[Title] <> null and Text.Trim(row[Title]) <> ""),
    titles = List.Distinct(List.Transform(rows, (row) => Text.Trim(row[Title]))),
    lastOf = (title as text) as text =>
        let row = List.Last(List.Select(rows, (candidate) => Text.Trim(candidate[Title]) = title)) in if row[Value] = null then "" else Text.Trim(row[Value]),
    values = Record.FromList(List.Transform(titles, lastOf), titles),
    value = (key as text, default as text) as text => let found = Record.FieldOrDefault(values, key, "") in if found = "" then default else found,
    requests = Record.FromList(
        List.Transform(MessageWords[requests], (request) => [Name = value("request." & request[id] & ".name", ""), Link = value("request." & request[id] & ".link", "")]),
        List.Transform(MessageWords[requests], (request) => request[id])),
    // "Pat Process <pat.process@example.com>; quinn@example.com": a name and its address in angle brackets, or an address alone.
    person = (part as text) as record =>
        let
            open = Text.PositionOf(part, "<"),
            close = Text.PositionOf(part, ">", Occurrence.Last)
        in
            if open >= 0 and close > open then [Name = Text.Trim(Text.Start(part, open)), Email = Text.Trim(Text.Middle(part, open + 1, close - open - 1))]
            else [Name = "", Email = Text.Trim(part)],
    teamIds = List.Transform(Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "record-teams", []), "teams", {}), (team) => team[id]),
    teams = Record.FromList(
        List.Transform(teamIds, (id) => [
            Name = value("team." & id & ".name", ""),
            People = List.Transform(List.Select(Text.SplitAny(value("team." & id & ".people", ""), ";#(cr)#(lf)"), (part) => Text.Trim(part) <> ""), person)
        ]),
        teamIds)
in
    [
        RowsInEmail =
            let
                range = SettingRanges[rowsInEmail],
                raw = value("rowsInEmail", ""),
                number = if raw <> "" and Text.Remove(raw, {"0".."9"}) = "" then Number.FromText(raw, "en-US") else null
            in
                if number <> null and number >= range[min] and number <= range[max] then number else range[default],
        PortalLink = value("portalLink", ""), Signature = value("signature", "SACM team"),
        EpoOwnerName = value("epoOwnerName", ""), EpoOwnerEmail = value("epoOwnerEmail", ""),
        ProcurementName = value("procurementName", "Procurement"), ProcurementEmail = value("procurementEmail", ""),
        ProcurementLeadName = value("procurementLeadName", ""), ProcurementLeadEmail = value("procurementLeadEmail", ""),
        Requests = requests, Teams = teams, Channel = "email"
    ]
