// The findings of a run as facts: each finding with who to ask about it, where it is fixed and how it is listed
// (src/core/cases/cases.ts, buildRun). Procurement problems go to the Procurement mailbox; a record a team is
// responsible for goes to the team (reference/record-teams, D195); a detector may name another CI whose people are asked
// (ContactCi); a CI from EPO where nobody can be asked goes to the EPO inventory owner (D47). Only a live check asks
// people (D346): a finding of a proposed check has nobody to ask. NobodyWhy says why nobody is asked, when nobody is
// (rule 10 of the real-data plan, fnContact): "SACM fixes it", "SACM checks it", "Proposed: nobody is asked until the
// card is live", or "Nobody to ask: " and the reasons; "" when someone is. Nothing is sent here.
(findings as list, run as record, packs as list) as list =>
    let
        cis = run[Cis],
        columns = run[Columns],
        // The contracts (and other records that are not CIs) findings are about: the first of each key; never a CI of the report.
        subjectGroups = fnGroupBy(Record.FieldOrDefault(run, "Subjects", {}), (subject) => subject[Key]),
        subjects = Record.FromList(List.Transform(Record.FieldValues(subjectGroups), List.First), Record.FieldNames(subjectGroups)),
        ciByKey = subjects & Record.FromList(cis, List.Transform(cis, (ci) => ci[Key])),
        // A contract says which roles it has; a CI has the columns of its report.
        columnsOf = (ci as record) as list => Record.FieldOrDefault(ci, "SubjectColumns", columns),
        packById = Record.FromList(packs, List.Transform(packs, (pack) => pack[id])),
        chipRules = List.Buffer(List.Transform(Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "tag-chips", []), "chips", {}), (rule) => rule & [TagKey = fnNameKey(rule[tag], "")])),
        teams = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "record-teams", []), "teams", {}),
        chipsOf = (ci as record) as list =>
            List.Distinct(List.Transform(List.Select(chipRules, (rule) => List.Contains(ci[TagKeys], rule[TagKey])), (rule) => rule[chip])),
        nameOf = (ci as record, role as text) as text =>
            let person = fnPerson(ci, role, columnsOf(ci)), shown = if person = null then "" else if person[Name] <> "" then person[Name] else person[Email] in
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
                    Tags = ci[TagList],
                    // A contract (fnContractSubject): its number, name and vendor, for the table of a message (build B7); null for a CI.
                    Contract = Record.FieldOrDefault(ci, "Contract", null)
                ],
                team = if pack = null or List.Contains(audience, "sacm") then null
                    else List.First(List.Select(teams, (candidate) => List.Contains(candidate[classes], ci[Class]) and List.Contains(candidate[checks], pack[id])), null),
                other = if finding[ContactCi] <> "" then Record.FieldOrDefault(ciByKey, finding[ContactCi], null) else null,
                theirs = if other = null then null else fnContact(other, "", audience, columnsOf(other)),
                contact =
                    if theirs <> null and theirs[To] <> null then
                        [To = theirs[To] & [Via = theirs[To][Via] & " of " & (if other[SourceClass] <> "" then other[SourceClass] else "Business Service") & " " & other[Name]], Cc = theirs[Cc]]
                    else fnContact(ci, finding[Field], audience, columnsOf(ci)),
                to = contact[To],
                above = if to = null then null else to[Above],
                status = if pack = null then "" else Record.FieldOrDefault(pack, "status", ""),
                why = if to <> null then ""
                    else if List.Contains(audience, "sacm") then (if Record.FieldOrDefault(pack, "reviewOnly", false) = true then "SACM checks it" else "SACM fixes it")
                    else if contact[Why] <> "" then "Nobody to ask: " & contact[Why]
                    else "Nobody to ask"
            in
                if pack <> null and status <> "live" then
                    base & [ContactName = "", ContactEmail = "", ContactId = "", ContactVia = "", Cc = {}, EscalateName = "", EscalateEmail = "", EscalateVia = "",
                        NobodyWhy = if status = "proposed" then "Proposed: nobody is asked until the card is live" else "Not live (" & status & "): nobody is asked until the card is live"]
                else if List.Contains(audience, "procurement") then
                    base & [ContactName = "Procurement", ContactEmail = "", ContactId = ReadingRules[procurement][id], ContactVia = ReadingRules[procurement][via], Cc = {}] & nobody & [NobodyWhy = ""]
                else if team <> null then
                    base & [Route = "", ContactName = team[name], ContactEmail = "", ContactId = "team:" & team[id], ContactVia = team[name] & " team", Cc = {}] & nobody & [NobodyWhy = ""]
                else if route <> "" and to = null then
                    base & [ContactName = ReadingRules[epoOwner][name], ContactEmail = "", ContactId = ReadingRules[epoOwner][id], ContactVia = ReadingRules[epoOwner][via], Cc = {}] & nobody & [NobodyWhy = ""]
                else
                    base & [
                        ContactName = if to = null then "" else to[Name], ContactEmail = if to = null then "" else to[Email],
                        ContactId = if to = null then "" else to[Id], ContactVia = if to = null then "" else to[Via], Cc = contact[Cc],
                        EscalateName = if above = null then "" else above[Name], EscalateEmail = if above = null then "" else above[Email],
                        EscalateVia = if above = null then "" else above[Via], NobodyWhy = why
                    ]
    in
        List.Transform(findings, factOf)
