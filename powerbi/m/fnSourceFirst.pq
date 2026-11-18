// The source first (D190, src/core/checks/detectors/source-first.ts): a people line of a CI that pairs with an EPO system
// is compared with EPO before anybody is asked. EPO already names another person: the line waits. EPO is empty or wrong
// too: the owner is asked, and the line says what EPO holds (Source). A leftover whose old person is still active gets a
// line of its own. Without the EPO systems report the lines stay as they are and a note says so.
// Returns [Findings, Notes].
(findings as list, run as record, packs as list) as record =>
    let
        config = ReferenceFiles[#"epo-systems-report"],
        rules = Record.FieldOrDefault(config, "sourceFirst", null),
        columns = run[Columns],
        cis = run[Cis],
        systems = run[EpoSystems],
        checks = if rules = null then {} else rules[checks] & rules[samePerson],
        why =
            if systems = null then "no EPO systems report is loaded. Load it with the CI report"
            else if not List.Contains(columns, "assetTag") then "the CI report has no column for the EPO ID (asset_tag)"
            else "",
        lines = List.Count(List.Select(findings, (finding) => List.Contains(checks, finding[CheckId]) and List.Contains(config[classes], finding[Class]))),
        notCompared = if lines = 0 then {} else {[CheckId = "SOURCE-FIRST", Note = Text.From(lines) & " people "
            & (if lines = 1 then "line of a CI from EPO was" else "lines of CIs from EPO were") & " not compared with EPO first: " & why & "."]},

        pairs = if systems = null or run[EpoComparison] = null then {} else run[EpoComparison][Pairs],
        // As a Map that is set pair after pair: the last pair of a CI wins.
        pairsByCi = fnGroupBy(pairs, (pair) => pair[Ci][Key]),
        pairByCi = Record.FromList(List.Transform(Record.FieldValues(pairsByCi), List.Last), Record.FieldNames(pairsByCi)),
        names = fnUserNames(cis, columns),
        inactive = List.Distinct(List.Combine(List.Transform(cis, (ci) => List.Combine(List.Transform(ReadingRules[roles], (role) =>
            let person = fnPerson(ci, role, columns) in
            if person = null then {}
            else (if person[UserId] <> "" and person[Active] = false then {Text.Lower(Text.Trim(person[UserId]), "en-US")} else {})
                & (if person[ManagerUserId] <> "" and person[ManagerActive] = false then {Text.Lower(Text.Trim(person[ManagerUserId]), "en-US")} else {})))))),
        roles = List.Select(config[roles], (entry) => List.Contains(columns, entry[role] & ".userId")),
        roleOf = (field as text) as nullable record => List.First(List.Select(roles, (entry) => entry[role] = field), null),
        cardOf = (id as text) as text =>
            let pack = List.First(List.Select(packs, (candidate) => candidate[id] = id), null) in
            if pack = null then id else Record.FieldOrDefault(pack, "cardLabel", pack[title]),
        follows = (pair as record) as text =>
            if pair[Mapped] = true then "SACM copies it into ServiceNow (card """ & cardOf(rules[cards][mapped]) & """)"
            else if pair[Mapped] = false then "the sync has not brought it yet (card """ & cardOf(rules[cards][notMapped]) & """)"
            else "ServiceNow does not show it yet",
        epoOf = (pair as record, entry as record) as text => Text.Lower(Text.Trim(Record.Field(pair[System], fnPascal(entry[column]))), "en-US"),
        said = (finding as record, source as text) as record => finding & [Detail = finding[Detail] & ". " & source, Source = source],

        compared = List.Buffer(List.Transform(findings, (finding) =>
            let
                pair = Record.FieldOrDefault(pairByCi, finding[CiKey], null),
                owner = roleOf("owned_by"),
                manager = roleOf("managed_by"),
                entry = if List.Contains(rules[checks], finding[CheckId]) then roleOf(finding[Field]) else null
            in
                if pair = null then finding
                else if List.Contains(rules[samePerson], finding[CheckId]) then
                    (if owner = null or manager = null then finding
                    else
                        let first = epoOf(pair, owner), second = epoOf(pair, manager) in
                        if first <> "" and second <> "" and first <> second then
                            finding & [Wait = "EPO already names two people (" & owner[epoLabel] & " " & fnPersonWords(first, names) & ", " & manager[epoLabel] & " "
                                & fnPersonWords(second, names) & "): " & follows(pair)]
                        else if first <> "" and first = second then said(finding, "EPO names the same person as " & owner[epoLabel] & " and " & manager[epoLabel])
                        else said(finding, (if second = "" then manager[epoLabel] else owner[epoLabel]) & " is empty in EPO"))
                else if entry = null then finding
                else
                    let
                        person = fnPerson(pair[Ci], entry[role], columns),
                        filled = person <> null and (person[Name] <> "" or person[Email] <> ""),
                        epo = epoOf(pair, entry),
                        own = if person = null then "" else Text.Lower(Text.Trim(person[UserId]), "en-US")
                    in
                        if epo = "" then said(finding, if filled
                            then entry[epoLabel] & " is empty in EPO; ServiceNow still shows the old person, because the sync never clears a field"
                            else entry[epoLabel] & " is empty in EPO too")
                        else if epo = own then said(finding, "EPO names the same person as " & entry[epoLabel])
                        else if List.Contains(inactive, epo) then said(finding, "EPO names " & fnPersonWords(epo, names) & " as " & entry[epoLabel] & ", who is not active either")
                        else finding & [Wait = "EPO already names " & fnPersonWords(epo, names) & " as " & entry[epoLabel] & ": " & follows(pair)])),

        // A leftover whose old person is still active has no line of its own: the role is empty in EPO, so the owner is asked.
        inScope = (pack as record, ci as record, role as text) as logical =>
            let
                detector = pack[detector],
                classes = Record.FieldOrDefault(Record.FieldOrDefault(detector, "forEachClasses", []), role, null)
            in
                fnInScope(pack, ci) and detector[type] = "rule" and List.Contains(Record.FieldOrDefault(detector, "forEach", {}), role)
                and (classes = null or List.Contains(classes, ci[Class])),
        candidates = List.Combine(List.Transform(pairs, (pair) => List.Transform(pair[Leftovers], (difference) => [Pair = pair, Difference = difference]))),
        added = List.Accumulate(candidates, [Keys = List.Transform(compared, (finding) => finding[Key]), Out = {}], (state, candidate) =>
            let
                pair = candidate[Pair],
                difference = candidate[Difference],
                entry = roleOf(difference[Field]),
                checkId = if entry = null then null else Record.FieldOrDefault(rules[leftover], entry[role], null),
                pack = if checkId = null then null else List.First(List.Select(packs, (candidate) => candidate[id] = checkId), null),
                key = if pack = null then "" else pack[id] & ":" & pair[Ci][Key] & ":" & entry[role],
                taken = List.Contains(state[Keys], key) or List.AnyTrue(List.Transform(compared, (finding) =>
                    finding[CiKey] = pair[Ci][Key] and finding[Field] = entry[role] and List.Contains(rules[checks], finding[CheckId]))),
                source = entry[label] & " is empty in EPO (" & entry[epoLabel] & "); ServiceNow still shows " & difference[Current] & ", because the sync never clears a field"
            in
                if entry = null or pack = null or not inScope(pack, pair[Ci], entry[role]) or taken then state
                else [Keys = state[Keys] & {key}, Out = state[Out] & {fnFinding(pack, pair[Ci], entry[role], source, [Source = source])}])
    in
        if rules = null then [Findings = findings, Notes = {}]
        else if why <> "" then [Findings = findings, Notes = notCompared]
        else [Findings = compared & added[Out], Notes = {}]
