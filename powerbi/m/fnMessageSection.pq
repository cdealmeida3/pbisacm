// The texts of one part of a message (src/core/messages/messages.ts, sectionTexts; build B7, D300): its Heading, the
// Intro, the Ask, the Why it matters (each [Html, Text]) and WhyYou (fnWhyYou). A part is the cases of one check and one
// route (and one kind of problem, for a check with byProblem). `texts`: the message texts of the part (fnDrafts gives
// those of its kind of problem); `route`: "epo" when the fix is made in EPO; `items`: the cases, each with its Fact;
// `settings`: MessageSettings. For a CI from EPO the ask names EPO's words for the roles; a team responsible for the
// record has its own ask (askByTeam, D195); a class may have its own ask (askByClass); a role with no request in the
// portal (Supported by) asks for a reply only (askNoRequest).
(texts as record, route as text, items as list, settings as record) as record =>
    let
        words = MessageWords,
        facts = List.Buffer(List.Transform(items, (item) => item[Fact])),
        fields = List.Distinct(List.Transform(facts, (fact) => fact[Field])),
        roles = List.Select(fields, (field) => Record.HasFields(words[roleLabel], field)),
        fill = (template as text) as record => fnMessageFill(template, fields, texts, settings),
        plain = (value as text) as record => [Html = fnHtml(value), Text = value],
        join = (parts as list) as record => [
            Html = Text.Combine(List.Select(List.Transform(parts, (part) => part[Html]), (value) => value <> ""), " "),
            Text = Text.Combine(List.Select(List.Transform(parts, (part) => part[Text]), (value) => value <> ""), " ")
        ],
        andList = (values as list) as text =>
            if List.Count(values) <= 1 then List.First(values, "") else Text.Combine(List.RemoveLastN(values, 1), ", ") & " and " & List.Last(values),
        textOf = (name as text) as text => let value = Record.FieldOrDefault(texts, name, null) in if value = null then "" else value,
        // 'sacm' is in runs saved before version 0.17 only: the fix is made in EPO all the same (D123).
        epo = route = "epo" or route = "sacm",
        contactId = facts{0}[ContactId],
        teamId = if Text.StartsWith(contactId, "team:") then Text.Middle(contactId, 5) else "",
        teamAsk = if teamId <> "" and List.AllTrue(List.Transform(facts, (fact) => fact[ContactId] = contactId))
            then Record.FieldOrDefault(Record.FieldOrDefault(texts, "askByTeam", []), teamId, null) else null,
        byClass = Record.FieldOrDefault(texts, "askByClass", []),
        ask =
            if epo then
                let
                    named = List.Select(roles, (field) => Record.HasFields(words[epoRole], field)),
                    first = if Record.FieldOrDefault(texts, "epoAsk", null) <> null then texts[epoAsk]
                        else if textOf("epoWhat") <> "" then "Please correct the " & texts[epoWhat] & " in EPO."
                        else if not List.IsEmpty(named) then
                            "In EPO, " & andList(List.Transform(named, (field) => Record.Field(words[roleLabel], field) & " is called " & Record.Field(words[epoRole], field))) & ". Please correct it in EPO."
                        else "Please correct it in EPO."
                in
                    // The service mapped flag is never named and never a reason to ask for a reply: copying EPO into ServiceNow is SACM's own job.
                    plain("These CIs come from EPO. " & first & " ServiceNow receives the change from EPO.")
            else if teamAsk <> null and teamAsk <> "" then fill(teamAsk)
            else
                let
                    noRequest = textOf("request") = "role" and textOf("askNoRequest") <> "" and not List.AnyTrue(List.Transform(roles, (field) => Record.HasFields(words[roleRequest], field))),
                    general = if noRequest then texts[askNoRequest] else texts[ask],
                    classes = List.Distinct(List.Transform(facts, (fact) => fact[Class])),
                    own = List.Select(classes, (cls) => Record.FieldOrDefault(byClass, cls, "") <> ""),
                    // "Service Offerings": the label of the class, a final y as ie, and an s.
                    labelOf = (cls as text) as text =>
                        let label = List.First(List.Select(facts, (fact) => fact[Class] = cls))[ClassLabel] in
                        (if Text.EndsWith(label, "y") then Text.Start(label, Text.Length(label) - 1) & "ie" else label) & "s"
                in
                    if List.Count(classes) = 1 and not List.IsEmpty(own) then fill(Record.Field(byClass, own{0}))
                    else if not List.IsEmpty(own) then
                        join(List.Transform(own, (cls) => join({plain("For " & labelOf(cls) & ":"), fill(Record.Field(byClass, cls))}))
                            & (if List.Count(classes) > List.Count(own) then {join({plain("For the other CIs:"), fill(general)})} else {}))
                    else fill(general),
        withSeveral = if textOf("several") <> "" and List.Count(List.Distinct(List.Transform(facts, (fact) => fact[CiKey]))) >= 3 then join({ask, fill(texts[several])}) else ask
    in
        [
            Heading = fill(texts[subject]), Intro = fill(texts[intro]), Ask = withSeveral, Why = fill(texts[why]),
            WhyYou = fnWhyYou(facts{0}[ContactVia], fnBelowWords(items))
        ]
