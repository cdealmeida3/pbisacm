// The messages to the people the checks ask (src/core/messages/messages.ts, buildDrafts; build B7, D300): one draft per
// person, across every card (D34). A person who got a message and did not answer gets a reminder in the thread of the
// first message (the same reference, D5); their points that were never asked join it as its second part, "New since
// then" (D161). When the reminders got no answer (OverLimit), the draft goes to the person above: an escalation (D40,
// D160), with the person asked in copy; when nobody is known, its To is empty and the manager types it in the Power App.
// A message holds at most MessageWords[maxCis] CIs; a longer one is split into parts (D36). The Procurement mailbox and a
// team get one message with every table, nobody copied (D98, D195). Building a draft sends nothing.
// `cases`: the cases to write about, each [Key, Fact (the finding, fnFacts), MessageEvents (its messages, oldest
// first), OverLimit]; `settings`: MessageSettings. A case nobody can be written to (no address, no message texts) is
// left out. Each draft: Ref (the reference of the message a reminder answers, "" for a new one), Kind (first, reminder,
// escalation), To, ToName, Cc ("a; b"), Subject, Body (HTML; every value from a report escaped), Plain (the same as
// text), Keys and NewKeys (the keys of "New since then"), CheckIds, CiCount, PartIndex, PartCount, About (for an
// escalation: who did not answer), NobodyAbove, Mailbox, Team, Person (who the draft is about) and Items (its cases).
// Subject, Body and Plain hold %%REF%% where the reference goes and %%SENDER%% where the name of the manager goes: the
// Power App fills both when the manager sends (D301). The order of the drafts and of their lines is the one of the
// HTML app. Layout: the same message as data, part by part, for the email template (fnEmailTemplate, D313), as
// src/core gives it (Draft.layout): Opening (HTML paragraphs, without Why), Why (the line why they get it, or ""),
// Sections (each Key, Group, Heading, Title, Lead, Role, Contract, Found, Rows, Ask, Why), FirstName, Cis, Noun, Sender,
// Signature. `settings` may hold MaxCis: the CIs a message holds before it is split (a test of the template, EmailsSplit).
(cases as list, settings as record) as list =>
    let
        words = MessageWords,
        packs = List.Buffer(List.Transform(Json.Document(CheckFiles), (file) => file[pack])),
        packById = Record.FromList(packs, List.Transform(packs, (pack) => pack[id])),
        orderById = Record.FromList(List.Positions(packs), List.Transform(packs, (pack) => pack[id])),
        messageOf = (pack as record) as nullable record => Record.FieldOrDefault(Record.FieldOrDefault(pack, "playbook", []), "message", null),
        packOf = (fact as record) as nullable record => Record.FieldOrDefault(packById, fact[CheckId], null),
        procurementId = ReadingRules[procurement][id],
        compare = Comparer.FromCulture("en-US"),
        lower = (value as text) as text => Text.Lower(value, "en-US"),
        textOf = (value as any) as text => if value = null then "" else value,
        plain = (value as text) as record => [Html = fnHtml(value), Text = value],
        join = (parts as list, separator as text) as record => [
            Html = Text.Combine(List.Select(List.Transform(parts, (part) => part[Html]), (value) => value <> ""), separator),
            Text = Text.Combine(List.Select(List.Transform(parts, (part) => part[Text]), (value) => value <> ""), separator)
        ],
        p = (rich as record) as record => [Html = if rich[Html] <> "" then "<p>" & rich[Html] & "</p>" else "", Text = rich[Text]],
        plural = (count as number, word as text) as text => Text.From(count) & " " & word & (if count = 1 then "" else "s"),
        andList = (values as list) as text =>
            if List.Count(values) <= 1 then List.First(values, "") else Text.Combine(List.RemoveLastN(values, 1), ", ") & " and " & List.Last(values),
        numberWords = {"no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"},
        times = (count as number) as text => if count = 1 then "once" else (if count >= 0 and count <= 10 then numberWords{count} else Text.From(count)) & " times",
        firstName = (name as text) as text =>
            let
                base = if Text.Contains(name, ",") then Text.Split(name, ","){1} else name,
                trimmed = Text.Trim(base)
            in
                Text.SplitAny(trimmed, " #(tab)#(cr)#(lf)"){0},
        capital = (value as text) as text => Text.Upper(Text.Start(value, 1), "en-US") & Text.Middle(value, 1),
        isTeam = (fact as record) as logical => Text.StartsWith(fact[ContactId], "team:"),
        toMailbox = (fact as record) as logical => fact[ContactId] = procurementId,
        isContract = (item as record) as logical => Record.FieldOrDefault(item[Fact], "Contract", null) <> null,
        recipientOf = (fact as record) as record => fnRecipient(fact, settings),
        // Who gets the escalation: the person above, or the Procurement lead for the mailbox; null when there is nobody.
        escalationOf = (fact as record, recipient as record) as nullable record =>
            if toMailbox(fact) then
                let email = Text.Trim(settings[ProcurementLeadEmail]) in
                if email = "" then null else [Name = if Text.Trim(settings[ProcurementLeadName]) <> "" then Text.Trim(settings[ProcurementLeadName]) else "Procurement lead", Email = email]
            else if textOf(fact[EscalateEmail]) = "" or lower(fact[EscalateEmail]) = lower(recipient[Email]) then null
            else [Name = textOf(fact[EscalateName]), Email = fact[EscalateEmail]],
        // The kind of problem of a finding of a check with byProblem: the first part of its field.
        problemOf = (fact as record) as text => Text.Split(fact[Field], "."){0},
        byProblem = (pack as record) as nullable record => Record.FieldOrDefault(messageOf(pack), "byProblem", null),
        textsOf = (pack as record, problem as nullable text) as record =>
            let base = messageOf(pack), own = if problem = null then null else Record.FieldOrDefault(Record.FieldOrDefault(base, "byProblem", []), problem, null) in
            if own = null then base else base & own,
        problemOrder = (fact as record) as number =>
            let kinds = Record.FieldNames(Record.FieldOrDefault(messageOf(packOf(fact)), "byProblem", [])), at = List.PositionOf(kinds, problemOf(fact)) in
            if at < 0 then List.Count(kinds) else at,
        sectionKey = (fact as record) as text =>
            fact[CheckId] & "|" & fact[Route] & "|" & (if byProblem(packOf(fact)) <> null then problemOf(fact) else ""),
        // The last message a reminder answers: an email if there is one, else a Teams chat.
        previousOf = (item as record) as nullable record =>
            let emails = List.Select(item[MessageEvents], (event) => event[Channel] <> "teams") in
            if List.IsEmpty(emails) then List.Last(item[MessageEvents], null) else List.Last(emails),

        /* ---------------------------------------------------------- who gets each case */
        entries = List.Buffer(List.RemoveNulls(List.Transform(cases, (item) =>
            let
                fact = item[Fact],
                recipient = recipientOf(fact),
                pack = packOf(fact)
            in
                if recipient[Email] = "" or pack = null or messageOf(pack) = null then null
                else
                    let
                        previous = previousOf(item),
                        kind = if previous <> null and previous[Ref] <> "" then "reminder" else "first",
                        escalate = kind = "reminder" and item[OverLimit],
                        above = if escalate then escalationOf(fact, recipient) else null,
                        // The Procurement mailbox without a Procurement lead in Settings: no escalation, the reminder goes again (D147).
                        final = if escalate and (above <> null or not toMailbox(fact)) then "escalation" else kind,
                        to = if final = "escalation" then (if above <> null then above else [Name = "", Email = ""]) else recipient,
                        previousRef = if final = "first" then "" else previous[Ref]
                    in
                        [
                            Item = item, Kind = final, PreviousRef = previousRef, To = to, NobodyAbove = final = "escalation" and above = null,
                            GroupKey = final & "|" & previousRef & "|" & lower(to[Email]) & "|" & (if final = "escalation" then lower(recipient[Email]) else "")
                        ]))),
        grouped = fnGroupBy(entries, (entry) => entry[GroupKey]),
        groups = List.Buffer(List.Transform(Record.FieldValues(grouped), (members) =>
            let first = members{0} in [Kind = first[Kind], PreviousRef = first[PreviousRef], To = first[To], NobodyAbove = first[NobodyAbove], Items = List.Transform(members, (entry) => entry[Item])])),
        // A reminder and the person's new points are one email (D161): a first message joins the person's first reminder.
        // The first reminder of each address (its position), and the first messages that join each reminder.
        reminderAt = fnGroupBy(List.Select(List.Positions(groups), (at) => groups{at}[Kind] = "reminder"), (at) => lower(groups{at}[To][Email]) & "|"),
        reminderFor = (group as record) as number =>
            if group[Kind] <> "first" or List.AnyTrue(List.Transform(group[Items], (item) => toMailbox(item[Fact]))) then -1
            else List.First(Record.FieldOrDefault(reminderAt, lower(group[To][Email]) & "|", {}), -1),
        targets = List.Buffer(List.Transform(groups, reminderFor)),
        joiners = fnGroupBy(List.Select(List.Positions(groups), (at) => targets{at} >= 0), (at) => Text.From(targets{at})),
        merged = List.Buffer(List.Transform(List.Positions(groups), (at) =>
            let
                group = groups{at},
                joining = List.Combine(List.Transform(Record.FieldOrDefault(joiners, Text.From(at), {}), (other) => groups{other}[Items]))
            in
                if targets{at} >= 0 then group & [Items = {}, Fresh = []]
                else group & [Items = group[Items] & joining, Fresh = Record.FromList(List.Transform(joining, (item) => true), List.Transform(joining, (item) => item[Key]))])),

        /* ---------------------------------------------------------- the parts of a message */
        contractTable = (items as list) as record =>
            let
                cells = (item as record) as list => let contract = item[Fact][Contract] in {textOf(contract[Number]), textOf(contract[Name]), textOf(contract[Vendor]), textOf(item[Fact][Detail])},
                rows = Text.Combine(List.Transform(items, (item) => "<tr>" & Text.Combine(List.Transform(cells(item), (cell) => "<td>" & fnHtml(cell) & "</td>")) & "</tr>"))
            in
                [
                    Html = "<table border=""1"" cellpadding=""6"" cellspacing=""0"" style=""border-collapse:collapse""><tr>"
                        & Text.Combine(List.Transform(words[contractColumns], (cell) => "<th align=""left"" style=""white-space:nowrap"">" & cell & "</th>")) & "</tr>" & rows & "</table>",
                    Text = Text.Combine(List.Transform(items, (item) => "- " & Text.Combine(List.Select(cells(item), (cell) => cell <> ""), " · ")), "#(lf)")
                ],
        table = (items as list, found as logical) as record =>
            if List.AllTrue(List.Transform(items, isContract)) then contractTable(items)
            else
                let
                    head = words[columns] & (if found then {"What we found"} else {}),
                    cells = (item as record) as list =>
                        let fact = item[Fact] in
                        {textOf(fact[CiName]), textOf(fact[EpoId]), textOf(fact[ClassLabel]), textOf(fact[OwnedBy]), textOf(fact[ManagedBy]), textOf(fact[Status]), textOf(fact[SupportGroup])}
                        & (if found then {textOf(fact[Detail])} else {}),
                    rows = Text.Combine(List.Transform(items, (item) => "<tr>" & Text.Combine(List.Transform(cells(item), (cell) => "<td>" & fnHtml(cell) & "</td>")) & "</tr>")),
                    line = (item as record) as text =>
                        let values = cells(item) in
                        "- " & Text.Combine(List.Select(List.Transform(List.Positions(values), (at) =>
                            let cell = values{at} in if at >= 3 and at <= 6 and cell <> "" then head{at} & ": " & cell else cell), (cell) => cell <> ""), " · ")
                in
                    [
                        Html = "<table border=""1"" cellpadding=""6"" cellspacing=""0"" style=""border-collapse:collapse""><tr>"
                            & Text.Combine(List.Transform(head, (cell) => "<th align=""left"" style=""white-space:nowrap"">" & cell & "</th>")) & "</tr>" & rows & "</table>",
                        Text = Text.Combine(List.Transform(items, line), "#(lf)")
                    ],
        // The cells of a line as text (src/core rowCells): those of the table, with "what we found" always last.
        rowCells = (item as record) as list =>
            let fact = item[Fact] in
            if isContract(item) then let contract = fact[Contract] in {textOf(contract[Number]), textOf(contract[Name]), textOf(contract[Vendor]), textOf(fact[Detail])}
            else {textOf(fact[CiName]), textOf(fact[EpoId]), textOf(fact[ClassLabel]), textOf(fact[OwnedBy]), textOf(fact[ManagedBy]), textOf(fact[Status]), textOf(fact[SupportGroup]), textOf(fact[Detail])},
        roleColumn = (via as text) as text => if via = "owned by" then "Owned by" else if via = "managed by" then "Managed by" else "",
        // One part per check and route (and kind of problem): its intro, table, ask and why; and the same as data (Layout, D313).
        sectionsBody = (items as list, kind as text, sameWhy as logical, group as text) as record =>
            let
                bySection = fnGroupBy(items, (item) => sectionKey(item[Fact])),
                sections = List.Buffer(List.Transform(Record.FieldValues(bySection), (members) =>
                    let
                        fact = members{0}[Fact],
                        pack = packOf(fact),
                        problem = if byProblem(pack) <> null then problemOf(fact) else null
                    in
                        [Key = sectionKey(fact), PackId = pack[id], Problem = problem, Items = members, Texts = fnMessageSection(textsOf(pack, problem), fact[Route], members, settings)])),
                several = List.Count(sections) > 1,
                part = (at as number) as list =>
                    let
                        chosen = sections{at},
                        texts = chosen[Texts],
                        members = chosen[Items],
                        found = several or List.Count(List.Distinct(List.Transform(members, (item) => item[Fact][Detail]))) > 1
                            or List.AnyTrue(List.Transform(members, (item) => textOf(item[Fact][Source]) <> "")),
                        count = if chosen[Problem] <> null then " (" & Text.From(List.Count(members)) & ")" else "",
                        next = if at + 1 < List.Count(sections) then sections{at + 1} else null,
                        // The parts of one check with a table per kind of problem share the line "why it matters": it comes once, after the last.
                        shareWhy = chosen[Problem] <> null and next <> null and next[PackId] = chosen[PackId] and next[Problem] <> null,
                        lead = join({if kind <> "escalation" and not sameWhy then plain(texts[WhyYou]) else plain(""), texts[Intro]}, " "),
                        contract = List.AllTrue(List.Transform(members, isContract))
                    in
                        [
                            Body = (if several then {[Html = "<h3 style=""margin:18px 0 6px"">" & texts[Heading][Html] & count & "</h3>", Text = "#(lf)" & Text.Upper(texts[Heading][Text], "en-US") & count]} else {})
                                & {p(lead), table(members, found)}
                                & (if kind <> "escalation" then {p(texts[Ask])} else {})
                                & (if shareWhy then {} else {p(texts[Why])}),
                            Layout = [
                                Key = chosen[Key], Group = group, Heading = texts[Heading][Html], Title = texts[Heading][Text], Lead = lead[Html],
                                Role = roleColumn(textOf(members{0}[Fact][ContactVia])), Contract = contract, Found = found or contract,
                                Rows = List.Buffer(List.Transform(members, rowCells)), Ask = if kind <> "escalation" then texts[Ask][Html] else "", Why = if shareWhy then "" else texts[Why][Html]
                            ]
                        ],
                done = List.Buffer(List.Transform(List.Positions(sections), part))
            in
                [Body = List.Combine(List.Transform(done, (one) => one[Body])), Layout = List.Transform(done, (one) => one[Layout])],
        // The first contact of these cases, by any channel (F02): its day and whether it was a Teams chat.
        firstContact = (items as list) as nullable record =>
            let
                all = List.Combine(List.Transform(items, (item) => item[MessageEvents])),
                numbered = List.Transform(List.Positions(all), (at) => [At = textOf(all{at}[At]), Channel = all{at}[Channel], Order = at]),
                first = List.First(List.Sort(numbered, (a, b) => let byAt = Value.Compare(a[At], b[At]) in if byAt <> 0 then byAt else Value.Compare(a[Order], b[Order])), null),
                day = if first = null then "" else Text.Start(first[At], 10)
            in
                if first <> null and Text.Length(day) = 10 and Text.Remove(day, {"0".."9"}) = "--" and Text.At(day, 4) = "-" and Text.At(day, 7) = "-"
                then [On = day, Teams = first[Channel] = "teams"] else null,
        longDate = (day as text) as text => fnLongDate(Date.FromText(day, [Format = "yyyy-MM-dd", Culture = "en-US"])),
        // The opening of an escalation: who is written to, why, and what we ask.
        escalationOpening = (items as list, person as record, nobodyAbove as logical) as text =>
            let
                below = fnBelowWords(items),
                fact = items{0}[Fact],
                attempts = List.Max(List.Transform(items, (item) => List.Count(item[MessageEvents]))),
                ask = "Could you help us to get an answer, or tell us who else to ask?",
                asked = if person[Name] <> "" then person[Name] else person[Email],
                role = if fact[ContactVia] = "managed by" then ", the Managed by person," else "",
                via = textOf(fact[EscalateVia])
            in
                if toMailbox(fact) then
                    let sentOn = List.Sort(List.Distinct(List.Combine(List.Transform(items, (item) => List.Transform(item[MessageEvents], (event) => Text.Start(event[At], 10)))))) in
                    "We wrote to the " & (if person[Name] <> "" then person[Name] else "Procurement") & " mailbox (" & person[Email] & ") on "
                        & andList(List.Transform(List.LastN(sentOn, 3), longDate)) & " about " & below & ", and we have no answer. "
                        & "You are the Procurement lead. Could you help us to get an answer, or tell us who else to ask?"
                else if nobodyAbove then "We asked " & asked & " " & times(attempts) & " about " & below & " and got no answer. " & ask
                else if via = "owner" then "You are the owner (Owned by) of " & below & ". We asked " & asked & role & " " & times(attempts) & " and got no answer. " & ask
                else if via = "manager of owner" or via = "department head of owner" then
                    "You are the " & (if via = "manager of owner" then "manager" else "head of the department") & " of the owner (Owned by) of " & below & ". We asked "
                        & asked & role & " " & times(attempts) & " and got no answer. " & ask
                else "We asked " & asked & role & " " & times(attempts) & " about " & below & " and got no answer. "
                    & "You are " & (if via = "department head" then "the head of their department" else "their manager") & " in ServiceNow. " & ask,

        /* ---------------------------------------------------------- one draft */
        draftOf = (items as list, group as record, ref as text, index as number, count as number) as record =>
            let
                kind = group[Kind],
                fresh = group[Fresh],
                person = recipientOf(items{0}[Fact]),
                to = group[To][Email],
                addresses = (if kind = "escalation" then {person[Email]} else {}) & List.Combine(List.Transform(items, (item) => item[Fact][Cc])),
                cc = List.Accumulate(addresses, {}, (known, address) =>
                    if address = "" or address = null or lower(address) = lower(to) or List.Contains(List.Transform(known, lower), lower(address)) then known else known & {address}),
                isFresh = (item as record) as logical => Record.HasFields(fresh, item[Key]),
                still = List.Select(items, (item) => not isFresh(item)),
                newOnes = List.Select(items, isFresh),
                two = not List.IsEmpty(still) and not List.IsEmpty(newOnes),
                // The line "why you" comes once at the top when every part says the same; else each part says it.
                sameWhy = List.Count(List.Distinct(List.Transform(items, (item) => fnWhyYou(item[Fact][ContactVia], "X")))) = 1,
                kinds = List.Count(List.Distinct(List.Transform(items, (item) => sectionKey(item[Fact])))),
                ciCount = List.Count(List.Distinct(List.Transform(items, (item) => item[Fact][CiKey]))),
                contracts = List.AllTrue(List.Transform(items, isContract)),
                noun = if contracts then "contract" else "CI",
                allTeam = List.AllTrue(List.Transform(items, (item) => isTeam(item[Fact]))),
                // A team is greeted by its name ("Hi Process Management,"), a person by the first name.
                greeted = if kind <> "escalation" and allTeam then Text.Trim(group[To][Name]) else firstName(group[To][Name]),
                firstOfStill = firstContact(still),
                reminderLine =
                    let
                        what = if firstOfStill <> null then "A short reminder of our " & (if firstOfStill[Teams] then "Teams message" else "message") & " of " & longDate(firstOfStill[On]) & "."
                            else "A short reminder.",
                        below = fnBelowWords(still)
                    in
                        if two then what & " The first part below is still open. The second part has new points for you."
                        else what & " " & capital(below) & " " & (if List.Count(List.Distinct(List.Transform(still, (item) => item[Fact][CiKey]))) = 1 then "is" else "are") & " still open.",
                why = fnWhyYou(items{0}[Fact][ContactVia], fnBelowWords(items)),
                opening = {plain("Hi" & (if greeted <> "" then " " & greeted else "") & ",")}
                    & (if kind = "reminder" then {plain(reminderLine)} else {})
                    & (if kind = "escalation" then {plain(escalationOpening(items, person, group[NobodyAbove]))} else {})
                    & (if kind <> "escalation" and sameWhy then {plain(if kinds > 1 then why & " We found " & plural(kinds, "kind") & " of problem." else why)} else {}),
                // The opening without the line why they get it (Layout): the email template adds that line itself.
                layoutOpening = List.Transform(List.FirstN(opening, List.Count(opening) - (if kind <> "escalation" and sameWhy then 1 else 0)), (piece) => piece[Html]),
                heading = (value as text) as record => [Html = "<h2 style=""margin:22px 0 4px;font-size:16px"">" & fnHtml(value) & "</h2>", Text = "#(lf)== " & Text.Upper(value, "en-US") & " =="],
                stillTitle = if firstOfStill <> null then "Still open (our message of " & longDate(firstOfStill[On]) & ")" else "Still open",
                halves = List.Buffer(if two then {sectionsBody(still, kind, sameWhy, stillTitle), sectionsBody(newOnes, kind, sameWhy, "New since then")} else {sectionsBody(items, kind, sameWhy, "")}),
                parts =
                    if two then {heading(stillTitle)} & halves{0}[Body] & {heading("New since then")} & halves{1}[Body]
                    else halves{0}[Body],
                signature = Text.Trim(if settings[Signature] <> "" then settings[Signature] else "SACM team"),
                body = List.Transform(opening, p) & parts
                    & {p(plain("When you reply, please keep the reference [" & ref & "] in the subject.")),
                       [Html = "<p>Thank you,<br>%%SENDER%%<br>" & fnHtml(signature) & "</p>", Text = "Thank you,#(lf)%%SENDER%%#(lf)" & signature]},
                firstFact = items{0}[Fact],
                firstPack = packOf(firstFact),
                only = if kinds = 1 then fnMessageSection(textsOf(firstPack, if byProblem(firstPack) <> null then problemOf(firstFact) else null), firstFact[Route], items, settings)[Heading][Text] else "",
                onWhat = if ciCount = 1 then firstFact[CiName] else plural(ciCount, noun),
                topic = if only <> "" then only & " on " & onWhat
                    else if contracts then plural(ciCount, "contract") & (if ciCount = 1 then " needs" else " need") & " a correction in Solusi"
                    else plural(ciCount, "CI") & (if ciCount = 1 then " needs" else " need") & " your attention in the CMDB",
                subjectTopic = if kind = "reminder" then "Reminder: " & topic
                    else if kind = "escalation" then "No answer on " & plural(ciCount, noun) & " of " & (if person[Name] <> "" then person[Name] else person[Email])
                    else topic,
                // The plain text: the parts with an empty line between them, never two.
                joined = Text.Combine(List.Transform(body, (piece) => piece[Text]), "#(lf)#(lf)"),
                collapsed = List.Last(List.Generate(() => joined, (value) => value <> null,
                    (value) => if Text.Contains(value, "#(lf)#(lf)#(lf)") then Text.Replace(value, "#(lf)#(lf)#(lf)", "#(lf)#(lf)") else null)),
                fact = items{0}[Fact]
            in
                [
                    Ref = if index = 1 then group[PreviousRef] else "", Kind = kind, To = to, ToName = group[To][Name], Cc = Text.Combine(cc, "; "),
                    Subject = subjectTopic & (if count > 1 then " (part " & Text.From(index) & " of " & Text.From(count) & ")" else "") & " [" & ref & "]",
                    Body = Text.Combine(List.Transform(body, (piece) => piece[Html])), Plain = Text.Trim(collapsed),
                    Keys = List.Transform(items, (item) => item[Key]), NewKeys = List.Transform(newOnes, (item) => item[Key]),
                    CheckIds = List.Distinct(List.Transform(items, (item) => item[Fact][CheckId])), CiCount = ciCount, PartIndex = index, PartCount = count,
                    About = if kind = "escalation" then (if person[Name] <> "" then person[Name] else person[Email]) else "",
                    NobodyAbove = kind = "escalation" and group[NobodyAbove],
                    Mailbox = List.AllTrue(List.Transform(items, (item) => toMailbox(item[Fact]))), Team = allTeam,
                    Person = if fact[ContactId] <> "" then fact[ContactId] else lower(textOf(fact[ContactEmail])),
                    Items = items,
                    Layout = [
                        Opening = layoutOpening, Why = if kind <> "escalation" and sameWhy then fnHtml(why) else "",
                        Sections = List.Combine(List.Transform(halves, (half) => half[Layout])), FirstName = textOf(fact[CiName]),
                        Cis = List.Buffer(List.Distinct(List.Transform(items, (item) => item[Fact][CiKey]))), Noun = noun, Sender = "%%SENDER%%", Signature = signature
                    ]
                ],

        /* ---------------------------------------------------------- every group, sorted and split */
        draftsOf = (group as record) as list =>
            let
                fresh = group[Fresh],
                // What the lines are sorted by, worked out once per line: new points last, then the order of the checks,
                // the kind of problem, the route and the name.
                numbered = List.Buffer(List.Transform(List.Positions(group[Items]), (at) =>
                    let item = group[Items]{at}, fact = item[Fact] in
                    [Item = item, Order = at, Fresh = if Record.HasFields(fresh, item[Key]) then 1 else 0, Pack = Record.Field(orderById, fact[CheckId]),
                        Problem = problemOrder(fact), Route = textOf(fact[Route]), Name = textOf(fact[CiName])])),
                order = (a as record, b as record) as number =>
                    let
                        byFresh = Value.Compare(a[Fresh], b[Fresh]),
                        byPack = if byFresh <> 0 then byFresh else Value.Compare(a[Pack], b[Pack]),
                        byProblem = if byPack <> 0 then byPack else Value.Compare(a[Problem], b[Problem]),
                        byRoute = if byProblem <> 0 then byProblem else compare(a[Route], b[Route]),
                        byName = if byRoute <> 0 then byRoute else compare(a[Name], b[Name])
                    in
                        if byName <> 0 then byName else Value.Compare(a[Order], b[Order]),
                items = List.Buffer(List.Transform(List.Sort(numbered, order), (entry) => entry[Item])),
                // Split by CI, never in the middle of a CI; the limit counts for the whole email. A mailbox or a team gets one message.
                whole = List.AllTrue(List.Transform(items, (item) => toMailbox(item[Fact]) or isTeam(item[Fact]))),
                limit = Record.FieldOrDefault(settings, "MaxCis", words[maxCis]),
                count = List.Count(items),
                chunkIds = if whole then List.Repeat({0}, count)
                    else List.Buffer(List.Skip(List.Generate(
                        () => [At = -1, Chunk = 0, Seen = [], Count = 0],
                        (state) => state[At] < count,
                        (state) =>
                            let at = state[At] + 1 in
                            if at >= count then [At = at, Chunk = state[Chunk], Seen = [], Count = 0]
                            else
                                let
                                    key = items{at}[Fact][CiKey],
                                    known = Record.HasFields(state[Seen], key)
                                in
                                    if not known and state[Count] >= limit then [At = at, Chunk = state[Chunk] + 1, Seen = Record.AddField([], key, true), Count = 1]
                                    else if known then [At = at, Chunk = state[Chunk], Seen = state[Seen], Count = state[Count]]
                                    else [At = at, Chunk = state[Chunk], Seen = Record.AddField(state[Seen], key, true), Count = state[Count] + 1],
                        (state) => state[Chunk]))),
                chunkCount = if count = 0 then 0 else List.Last(chunkIds) + 1,
                byChunk = fnGroupBy(List.Transform(List.Positions(items), (at) => [Chunk = Text.From(chunkIds{at}), Item = items{at}]), (entry) => entry[Chunk]),
                chunks = List.Buffer(List.Transform(Record.FieldValues(byChunk), (entries) => List.Transform(entries, (entry) => entry[Item]))),
                one = (chunk as number) as record =>
                    let
                        members = chunks{chunk},
                        // A part that holds only new points is a first message of its own.
                        onlyNew = group[Kind] = "reminder" and List.AllTrue(List.Transform(members, (item) => Record.HasFields(fresh, item[Key]))),
                        own = if onlyNew then group & [Kind = "first", PreviousRef = "", Fresh = []] else group
                    in
                        draftOf(members, own, "%%REF%%", chunk + 1, chunkCount)
            in
                if count = 0 then {} else List.Transform(List.Numbers(0, chunkCount), one)
    in
        List.Buffer(List.Combine(List.Transform(merged, draftsOf)))
