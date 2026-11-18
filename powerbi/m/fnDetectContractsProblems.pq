// The problems of the contract data (code detector contracts/problems, src/core/checks/detectors/contract-detectors.ts,
// contractProblems): the list `problems` of reference/contract-reports; a check raises the ones of its detector.rules (all
// when it has none). One finding per contract and problem; the field is the id of the problem and Problem its label, so
// the message shows one table per problem. "For Procurement" raises the problems of Solusi itself; "Contracts to fix in
// ServiceNow" the ones SACM corrects in ServiceNow, each with its line of the fix list (D145). An inactive contract owner
// or Procurement partner is SACM's when the loaded reports know an active account with the same name (the upload picked
// the wrong account), and Procurement's when they know none (the person left, D193). Every problem is marked as tested,
// also the ones a check does not raise, so a problem that moved to the other card closes on this one.
(pack as record, run as record, config as record) as record =>
    let
        words = ContractWords,
        contracts = run[Contracts],
        pairs = contracts[Pairs],
        solusiDate = contracts[Solusi][Date],
        servicenowContracts = contracts[ServiceNow][Contracts],
        rules = Record.FieldOrDefault(pack[detector], "rules", null),
        wanted = (id as text) as logical => rules = null or List.Contains(rules, id),
        fixList = Record.FieldOrDefault(Record.FieldOrDefault(pack, "playbook", []), "path", "") = "sacm-fix",
        problemOf = (id as text) as nullable record => List.First(List.Select(config[problems], (entry) => entry[id] = id), null),
        label = (id as text) as text => let found = problemOf(id) in if found = null then id else found[label],
        fixOf = (id as text, current as text) as nullable record =>
            let found = problemOf(id) in
            if not fixList then null
            else [Change = if found = null then id else Record.FieldOrDefault(found, "change", found[label]), Current = current, Set = if found = null then "" else Record.FieldOrDefault(found, "set", "")],
        line = (subject as record, field as text, detail as text, fix as nullable record, group as text) as record =>
            fnFinding(pack, subject, field, detail, [Fix = fix, Problem = group, Subject = subject]),
        // A finding of problem `id` when the check raises it.
        raise = (subject as record, id as text, detail as text, current as text) as list =>
            if wanted(id) then {line(subject, id, detail, fixOf(id, current), label(id))} else {},
        tested = (id as text, count as number) as record =>
            [Findings = {}, Tested = {pack[id] & ":" & id}, Notes = {},
                Evaluated = if wanted(let at = Text.PositionOf(id, ".") in if at < 0 then id else Text.Start(id, at)) then {[Part = pack[id] & ":" & id, Count = count]} else {}],
        none = [Findings = {}, Tested = {}, Evaluated = {}, Notes = {}],
        noted = (id as text, text as text) as list => if wanted(id) then {text} else {},
        running = (contract as record) as logical => words[InList](config[runningStatuses], contract[Status]),
        concluded = (contract as record) as logical => words[InList](config[concludedStatuses], contract[Status]),
        active = List.Buffer(List.Select(contracts[Solusi][Contracts], (contract) => contract[Sheet] = "active")),
        servicenowOf = (contract as record) as nullable record => Record.FieldOrDefault(contracts[ServiceNowOf], Text.Lower(contract[Number], "en-US"), null),
        subjectOf = (contract as record) as record => fnContractSubject(servicenowOf(contract), contract),

        // The active accounts the loaded reports know, by the name of the person (D193, activeAccounts): the people of
        // the CIs and their managers, and the people of the ServiceNow contracts. Only an account with a user ID counts.
        accounts =
            let
                columns = run[Columns],
                account = (name as text, userId as text, isActive as any) as list =>
                    if Text.Trim(name) = "" or Text.Trim(userId) = "" or isActive <> true then {} else {[Name = fnNameKey(name, ""), Id = Text.Lower(Text.Trim(userId), "en-US")]},
                ofCis = List.Combine(List.Transform(run[Cis], (ci) => List.Combine(List.Transform(ReadingRules[roles], (role) =>
                    let person = fnPerson(ci, role, columns) in
                    if person = null then {} else account(person[Name], person[UserId], person[Active]) & account(person[Manager], person[ManagerUserId], person[ManagerActive]))))),
                ofContracts = List.Combine(List.Transform(servicenowContracts, (contract) =>
                    account(contract[Owner], contract[OwnerUserId], contract[OwnerActive]) & account(contract[ProcurementPartner], contract[ProcurementPartnerUserId], contract[ProcurementPartnerActive]))),
                grouped = fnGroupBy(ofCis & ofContracts, (entry) => entry[Name])
            in
                Record.FromList(List.Transform(Record.FieldValues(grouped), (entries) => List.Distinct(List.Transform(entries, (entry) => entry[Id]))), Record.FieldNames(grouped)),
        runningPairs = List.Buffer(List.Select(pairs, (pair) => running(pair[Solusi]))),
        people = {
            [Id = "ownerInactive", Left = "ownerLeft", Field = "Owner", Flag = "OwnerActive", UserId = "OwnerUserId", Word = "Contract owner"],
            [Id = "partnerInactive", Left = "partnerLeft", Field = "ProcurementPartner", Flag = "ProcurementPartnerActive", UserId = "ProcurementPartnerUserId", Word = "Procurement partner"]
        },
        inactive = List.Transform(people, (entry) =>
            let
                lowerWord = Text.Lower(entry[Word], "en-US"),
                known = List.AnyTrue(List.Transform(servicenowContracts, (contract) => Record.Field(contract, entry[Flag]) <> null)),
                findingsOf = (pair as record) as list =>
                    let
                        contract = pair[ServiceNow],
                        name = Record.Field(contract, entry[Field]),
                        own = Text.Lower(Text.Trim(Record.Field(contract, entry[UserId])), "en-US"),
                        others = List.Sort(List.Select(Record.FieldOrDefault(accounts, fnNameKey(name, ""), {}), (id) => id <> own)),
                        fix = fixOf(entry[Id], name & " (" & (if own <> "" then own & ", " else "") & "inactive)")
                    in
                        if name = "" or Record.Field(contract, entry[Flag]) <> false then {}
                        else if List.IsEmpty(others) then
                            raise(pair[Subject], entry[Left], entry[Word] & " " & name & " is no longer active in ServiceNow, and no active account with that name is known", name & " (inactive)")
                        else if not wanted(entry[Id]) then {}
                        else {line(pair[Subject], entry[Id],
                            entry[Word] & " " & name & " is inactive in ServiceNow" & (if own <> "" then " (account " & own & ")" else "") & ". An active account with the same name exists: " & Text.Combine(others, " or "),
                            if fix = null then null else fix & [Set = name & " (" & Text.Combine(others, " or ") & ")", Value = if List.Count(others) = 1 then others{0} else ""],
                            label(entry[Id]))}
            in
                if not known then none & [Notes =
                    noted(entry[Id], "Not tested for an inactive " & lowerWord & ": the ServiceNow contract report has no column that says if the person is active.")
                    & noted(entry[Left], "Not tested for a " & lowerWord & " who left: the ServiceNow contract report has no column that says if the person is active.")]
                else fnCombineOutputs({tested(entry[Id], List.Count(runningPairs)), tested(entry[Left], List.Count(runningPairs))})
                    & [Findings = List.Buffer(List.Combine(List.Transform(runningPairs, findingsOf))), Notes = {}]),

        // The dates, the vendor number and the contract owner of the active tab of Solusi.
        concludedCount = List.Count(List.Select(active, concluded)),
        ofActive = List.Combine(List.Transform(active, (contract) =>
            let subject = subjectOf(contract) in
            (if concluded(contract) and contract[End] <> null and solusiDate <> null and contract[End] < solusiDate
                then raise(subject, "endPassed", contract[Status] & ", but the end date " & fnLongDate(contract[End]) & " has passed", contract[Status] & ", ends " & fnLongDate(contract[End])) else {})
            & (if concluded(contract) and contract[End] = null and words[InList](config[fixedTermWords], contract[Duration])
                then raise(subject, "noEnd", contract[Duration] & ", but no end date", contract[Duration] & ", no end date") else {})
            & (if contract[VendorNumber] = ""
                then raise(subject, "noVendorNumber", "No vendor number for " & (if contract[Vendor] <> "" then contract[Vendor] else "the vendor") & ", so the vendor stays empty in ServiceNow", "") else {})
            & (if running(contract) and contract[Owner] = "" then raise(subject, "noOwner", "No contract owner", "") else {}))),
        dates = fnCombineOutputs({tested("endPassed", concludedCount), tested("noEnd", concludedCount), tested("noVendorNumber", List.Count(active)),
            tested("noOwner", List.Count(List.Select(active, running)))}) & [Findings = List.Buffer(ofActive)],

        // A name of a person that ServiceNow shows differently: most often free text that ServiceNow did not recognise.
        personFields = List.Select(config[fields], (entry) => entry[kind] = "person"),
        names = fnCombineOutputs(List.Transform(personFields, (entry) => tested("personName." & entry[field], List.Count(pairs)))) & [Findings =
            if not wanted("personName") then {}
            else List.Buffer(List.Combine(List.Transform(pairs, (pair) => List.Transform(List.Select(pair[Differences], (difference) => difference[Kind] = "person"), (difference) =>
                let fix = fixOf("personName", if difference[ServiceNow] = "" then "nobody" else difference[ServiceNow]) in
                line(pair[Subject], "personName." & difference[Field],
                    difference[Label] & ": Solusi has """ & difference[Solusi] & """, ServiceNow has " & (if difference[ServiceNow] = "" then "nobody" else """" & difference[ServiceNow] & """"),
                    if fix = null then null else fix & [Change = difference[Label] & ": " & fix[Change], Set = difference[Solusi], Value = difference[Solusi]],
                    label("personName"))))))],

        // The EPO ID column: a system that is Retired, or a number that is not an EPO ID.
        epo = config[epo],
        epoIds =
            if not List.Contains(run[Columns], "assetTag") then none & [Notes = noted("epoUnknown", "Not tested for the EPO ID of a contract: the CI report has no column for the EPO ID (asset_tag).")]
            else
                let
                    systemCis = List.Select(run[Cis], (ci) => List.Contains(epo[classes], ci[Class]) and Text.Trim(ci[AssetTag]) <> ""),
                    systems = fnGroupBy(systemCis, (ci) => Text.Lower(Text.Trim(ci[AssetTag]), "en-US")),
                    retired = (ci as record) as logical => words[InList](epo[retiredStatuses], ci[Status]),
                    // An id counts as known as it is written ("AST-0006") or by its digits.
                    idsOf = (contract as record) as list => List.Distinct(List.Transform(fnEpoIds(contract[EpoId], epo[minDigits]), (id) =>
                        if Record.HasFields(systems, Text.Lower(id[Written], "en-US")) then Text.Lower(id[Written], "en-US") else id[Digits])),
                    withIds = List.Buffer(List.Select(List.Transform(List.Select(active, running), (contract) => [Contract = contract, Ids = idsOf(contract)]), (item) => not List.IsEmpty(item[Ids]))),
                    findingsOf = (item as record) as list =>
                        let
                            contract = item[Contract],
                            subject = subjectOf(contract),
                            gone = List.Select(item[Ids], (id) => Record.HasFields(systems, id) and List.AllTrue(List.Transform(Record.Field(systems, id), retired))),
                            unknown = List.Select(item[Ids], (id) => not Record.HasFields(systems, id)),
                            named = (id as text) as text => let ci = Record.Field(systems, id){0} in Text.Trim(ci[AssetTag]) & " (" & ci[Name] & ")"
                        in
                            (if List.IsEmpty(gone) then {} else raise(subject, "epoRetired", "EPO ID " & Text.Combine(List.Transform(gone, named), ", ") & ": the system is Retired", ""))
                            & (if List.IsEmpty(unknown) then {} else raise(subject, "epoUnknown", "EPO ID " & Text.Combine(unknown, ", ") & ": not the EPO ID of a system in ServiceNow", ""))
                in
                    fnCombineOutputs({tested("epoRetired", List.Count(withIds)), tested("epoUnknown", List.Count(withIds))}) & [Findings = List.Buffer(List.Combine(List.Transform(withIds, findingsOf)))]
    in
        fnCombineOutputs(inactive & {dates, names, epoIds})
