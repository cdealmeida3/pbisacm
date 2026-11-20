// Table SettingsCheck (build R3): the settings of the list SACM Settings that the emails need, for the page Data check.
// One row per setting, in the order of the box: the Service Portal, the signature, the Procurement mailbox and its lead,
// the EPO inventory owner, the people of each team of reference/record-teams, the link of each request of the Service
// Portal. Value: what the emails use (MessageSettings, with its defaults). State: Set, Default (the signature only) or
// Missing; Why: what an email lacks while it is missing. Setting is the Title to type in SACM Settings.
let
    settings = MessageSettings,
    line = (order as number, setting as text, label as text, value as text, missing as text) as list =>
        {order, setting, label, value, if value = "" then "Missing" else "Set", if value = "" then missing else ""},
    fixed = {
        line(1, "portalLink", "Service Portal link", settings[PortalLink], "The emails name the Service Portal without a link."),
        {2, "signature", "Signature", settings[Signature], if settings[Signature] = "SACM team" then "Default" else "Set", ""},
        line(3, "procurementEmail", "Procurement mailbox", settings[ProcurementEmail], "The emails of the cards for Procurement have no To."),
        line(4, "procurementLeadEmail", "Procurement lead", settings[ProcurementLeadEmail], "Procurement gets no escalation."),
        line(5, "epoOwnerEmail", "EPO inventory owner", settings[EpoOwnerEmail], "A line of EPO that nobody else can answer has no To.")
    },
    teams = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "record-teams", []), "teams", {}),
    teamLines = List.Transform(List.Positions(teams), (at) =>
        let
            team = teams{at},
            people = Record.Field(settings[Teams], team[id])[People],
            value = Text.Combine(List.Transform(people, (person) => if person[Name] = "" then person[Email] else person[Name] & " <" & person[Email] & ">"), "; ")
        in
            line(6 + at, "team." & team[id] & ".people", "Team " & team[name], value, "The lines of this team have no To.")),
    requests = MessageWords[requests],
    requestLines = List.Transform(List.Positions(requests), (at) =>
        let request = requests{at} in
        line(6 + List.Count(teams) + at, "request." & request[id] & ".link", "Request " & request[name], Record.Field(settings[Requests], request[id])[Link],
            "The emails name the request without its link."))
in
    #table(type table [Order = Int64.Type, Setting = text, Label = text, Value = text, State = text, Why = text], fixed & teamLines & requestLines)
