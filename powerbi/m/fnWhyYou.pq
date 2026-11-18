// Why a person gets a message, from how the contact was found (src/core/messages/messages.ts, whyYou; build B7):
// "ServiceNow names you as Managed by of the CI below." `via`: the ContactVia of the finding; `below`: fnBelowWords.
(via as text, below as text) as text =>
    let
        words = MessageWords,
        firstSpace = (value as text) as text => let at = Text.PositionOf(value, " ") in if at < 0 then value else Text.Start(value, at) & "_" & Text.Middle(value, at + 1),
        label = (value as text) as text => Record.FieldOrDefault(words[roleLabel], firstSpace(Text.Trim(value)), value),
        above = if Text.StartsWith(via, "manager of ") and Text.Length(via) > 11 then [Who = "manager", Of = Text.Middle(via, 11)]
            else if Text.StartsWith(via, "department head of ") and Text.Length(via) > 19 then [Who = "department head", Of = Text.Middle(via, 19)]
            else null
    in
        if above <> null then "You are the " & above[Who] & " of the " & label(above[Of]) & " of " & below & "."
        else if via = ReadingRules[epoOwner][via] then "You are the inventory owner of EPO, and nobody else could be asked about " & below & "."
        // A team responsible for the record of a class (D195): "Process Management team".
        else if Text.EndsWith(via, " team") then Text.Start(via, Text.Length(via) - 5) & " is responsible for the record of " & below & ". SACM updates ServiceNow with what you tell us."
        else if via = ReadingRules[procurement][via] then "Procurement owns the contract data in Solusi. The contracts below need a correction in Solusi: ServiceNow receives it with the next upload."
        else if Record.HasFields(words[roleLabel], firstSpace(via)) then "ServiceNow names you as " & label(via) & " of " & below & "."
        else "You are named on " & below & "."
