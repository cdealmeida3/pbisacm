// The findings of a run as facts: each finding with who to ask about it, where it is fixed and how it is listed
// (src/core/cases/cases.ts, buildRun). Procurement problems go to the Procurement mailbox; a record a team is
// responsible for goes to the team (reference/record-teams, D195); a detector may name another CI whose people are asked
// (ContactCi); a CI from EPO where nobody can be asked goes to the EPO inventory owner (D47). Nothing is sent here.
(findings as list, run as record, packs as list) as list =>
    let
        cis = run[Cis],
        columns = run[Columns],
        ciByKey = Record.FromList(cis, List.Transform(cis, (ci) => ci[Key])),
        packById = Record.FromList(packs, List.Transform(packs, (pack) => pack[id])),
        chipRules = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "tag-chips", []), "chips", {}),
        teams = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "record-teams", []), "teams", {}),
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        chipsOf = (ci as record) as list =>
            List.Distinct(List.Transform(List.Select(chipRules, (rule) => List.AnyTrue(List.Transform(ci[TagList], (tag) => same(tag, rule[tag])))), (rule) => rule[chip])),
        nameOf = (ci as record, role as text) as text =>
            let person = fnPerson(ci, role, columns), shown = if person = null then "" else if person[Name] <> "" then person[Name] else person[Email] in
            if shown = "" then "" else shown & (if person[Active] = false then " (inactive)" else ""),
        nobody = [EscalateName = "", EscalateEmail = "", EscalateVia = ""],
        factOf = (finding as record) as record =>
            let
                ci = Record.Field(ciByKey, finding[CiKey]),
                pack = Record.FieldOrDefault(packById, finding[CheckId], null),
                playbook = if pack = null then [] else Record.FieldOrDefault(pack, "playbook", []),
                audience = Record.FieldOrDefault(playbook, "audience", {}),
                route = if Record.FieldOrDefault(playbook, "routeBy", "") = "epo" and finding[InServiceNow] <> true and fnFixedInEpo(ci, finding[CheckId], finding[Field]) then "epo" else "",
                listed = fnListing(ci, pack, finding[Review], finding[Wait]),
                own = chipsOf(ci),
                module = if pack <> null and List.Contains(ReadingRules[modules], pack[dimension]) then pack[dimension] else "correctness",
                base = finding & [
                    Detail = fnCapital(finding[Detail]),
                    ClassLabel = if ci[SourceClass] <> "" then ci[SourceClass] else finding[Class],
                    Module = module, Route = route, State = listed[State], StateWhy = listed[Why],
                    EpoId = ci[AssetTag], Status = ci[Status], SupportGroup = ci[SupportGroup],
                    OwnedBy = nameOf(ci, "owned_by"), ManagedBy = nameOf(ci, "managed_by"), SupportedBy = nameOf(ci, "supported_by"),
                    Chips = own & List.Select(List.Distinct(finding[Chips]), (chip) => not List.Contains(own, chip)),
                    Tags = ci[TagList]
                ],
                team = if pack = null or List.Contains(audience, "sacm") then null
                    else List.First(List.Select(teams, (candidate) => List.Contains(candidate[classes], ci[Class]) and List.Contains(candidate[checks], pack[id])), null),
                other = if finding[ContactCi] <> "" then Record.FieldOrDefault(ciByKey, finding[ContactCi], null) else null,
                theirs = if other = null then null else fnContact(other, "", audience, columns),
                contact =
                    if theirs <> null and theirs[To] <> null then
                        [To = theirs[To] & [Via = theirs[To][Via] & " of " & (if other[SourceClass] <> "" then other[SourceClass] else "Business Service") & " " & other[Name]], Cc = theirs[Cc]]
                    else fnContact(ci, finding[Field], audience, columns),
                to = contact[To],
                above = if to = null then null else to[Above]
            in
                if List.Contains(audience, "procurement") then
                    base & [ContactName = "Procurement", ContactEmail = "", ContactId = ReadingRules[procurement][id], ContactVia = ReadingRules[procurement][via], Cc = {}] & nobody
                else if team <> null then
                    base & [Route = "", ContactName = team[name], ContactEmail = "", ContactId = "team:" & team[id], ContactVia = team[name] & " team", Cc = {}] & nobody
                else if route <> "" and to = null then
                    base & [ContactName = ReadingRules[epoOwner][name], ContactEmail = "", ContactId = ReadingRules[epoOwner][id], ContactVia = ReadingRules[epoOwner][via], Cc = {}] & nobody
                else
                    base & [
                        ContactName = if to = null then "" else to[Name], ContactEmail = if to = null then "" else to[Email],
                        ContactId = if to = null then "" else to[Id], ContactVia = if to = null then "" else to[Via], Cc = contact[Cc],
                        EscalateName = if above = null then "" else above[Name], EscalateEmail = if above = null then "" else above[Email],
                        EscalateVia = if above = null then "" else above[Via]
                    ]
    in
        List.Transform(findings, factOf)
