// Who a finding goes to (src/core/messages/messages.ts, recipientOf; build B7): [Name, Email]. The EPO inventory owner,
// the Procurement mailbox and the people of a team come from the team settings (MessageSettings); everybody else is the
// contact of the finding (fnFacts). The address of a team is its people's addresses, "a@…; b@…" (teamAddresses: no
// space, an @ with text before and after it); "" when the settings name nobody.
(fact as record, settings as record) as record =>
    let
        contactId = fact[ContactId],
        isAddress = (value as text) as logical =>
            value <> "" and Text.Remove(value, {" ", "#(tab)", "#(cr)", "#(lf)"}) = value
            and List.AnyTrue(List.Transform(Text.PositionOf(value, "@", Occurrence.All), (at) => at >= 1 and at <= Text.Length(value) - 2)),
        textOf = (value as any) as text => if value = null then "" else value
    in
        if contactId = ReadingRules[epoOwner][id] then [Name = if settings[EpoOwnerName] <> "" then settings[EpoOwnerName] else ReadingRules[epoOwner][name], Email = settings[EpoOwnerEmail]]
        else if contactId = ReadingRules[procurement][id] then [Name = if settings[ProcurementName] <> "" then settings[ProcurementName] else "Procurement", Email = settings[ProcurementEmail]]
        else if Text.StartsWith(contactId, "team:") then
            let team = Record.FieldOrDefault(settings[Teams], Text.Middle(contactId, 5), null) in
            [
                Name = if team <> null and Text.Trim(team[Name]) <> "" then Text.Trim(team[Name]) else textOf(fact[ContactName]),
                Email = if team = null then "" else Text.Combine(List.Select(List.Transform(team[People], (person) => Text.Trim(person[Email])), isAddress), "; ")
            ]
        else [Name = textOf(fact[ContactName]), Email = textOf(fact[ContactEmail])]
