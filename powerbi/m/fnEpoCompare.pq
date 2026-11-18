// The EPO systems report compared with the CI report (src/core/sources/epo/epo-report.ts, compareEpo): a system matches
// the CI of the classes of reference/epo-systems-report whose asset tag is its EPO ID (two CIs with the tag: the live
// one). A pair Retired on both sides is not compared. Compared: status, name (the EPO name and " - PROD"), the three people
// by user ID and, when the CI report has the column, the description (by letters and digits: empty, cut short or another
// start). A role empty in EPO while ServiceNow still shows a person is a leftover (D190): the owner is asked, it is on
// neither EPO card. Returns [Pairs, WithoutCi, RetiredBoth, Notes]; a pair is [Ci, System, Mapped, Differences, Leftovers],
// a difference [Field, Label, Current, Epo, Value, Leftover].
(cis as list, systems as list, columns as list, config as record) as record =>
    let
        retiredWords = List.Transform(config[retiredStatuses], (word) => fnNameKey(word, "")),
        isRetired = (status as text) as logical => List.Contains(retiredWords, fnNameKey(status, "")),
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        byTag = fnGroupBy(List.Select(cis, (ci) => List.Contains(config[classes], ci[Class]) and ci[AssetTag] <> ""), (ci) => Text.Lower(Text.Trim(ci[AssetTag]), "en-US")),
        names = fnUserNames(cis, columns),
        roles = List.Select(config[roles], (entry) => List.Contains(columns, entry[role] & ".userId") or List.Contains(columns, entry[role])),
        unread = List.Select(config[roles], (entry) => not List.Contains(roles, entry)),
        noUserId = List.Select(roles, (entry) => not List.Contains(columns, entry[role] & ".userId")),
        compared = List.Select(roles, (entry) => List.Contains(columns, entry[role] & ".userId")),
        descriptions = List.Contains(columns, "description"),
        labels = (entries as list) as text => Text.Combine(List.Transform(entries, (entry) => entry[label]), ", "),
        notes =
            (if List.IsEmpty(unread) then {} else {"The CI report has no column for " & labels(unread) & ", so " & (if List.Count(unread) = 1 then "it is" else "they are") & " not compared."})
            & (if List.IsEmpty(noUserId) then {} else {"The CI report has no user ID column for " & labels(noUserId) & " ("
                & Text.Combine(List.Transform(noUserId, (entry) => entry[role] & ".user_name"), ", ") & "): EPO names people by user ID, so "
                & (if List.Count(noUserId) = 1 then "it is" else "they are") & " not compared."})
            & (if descriptions then {} else {"The CI report has no description column (short_description), so the description is not compared."}),
        leftovers = Record.HasFields(config, "sourceFirst"),
        startOf = (text as text) as text => if Text.Length(text) > 120 then Text.Start(text, 117) & "…" else text,
        words = [empty = "empty in ServiceNow, EPO has one", cut = "stops before the end of the EPO text", start = "starts differently from the EPO text"],
        // How the description differs (descriptionDifference): "" when the same, or when only later words differ.
        descriptionKind = (ci as record, system as record) as text =>
            let
                epo = fnLetters(system[Description]),
                now = fnLetters(if ci[Description] = null then "" else ci[Description]),
                start = List.Max({1, config[descriptionStart]})
            in
                if epo = "" or now = epo then ""
                else if now = "" then "empty"
                else if Text.StartsWith(epo, now) then "cut"
                else if Text.Start(now, start) <> Text.Start(epo, start) then "start"
                else "",
        pairOf = (system as record) as nullable record =>
            let
                first = Record.FieldOrDefault(byTag, Text.Lower(Text.Trim(system[EpoId]), "en-US"), {}),
                live = List.Select(first, (ci) => not isRetired(ci[Status])),
                found = if List.Count(first) > 1 and not List.IsEmpty(live) then live else first,
                ci = if List.IsEmpty(found) then null else found{0},
                epoRetired = system[Status] <> "" and isRetired(system[Status]),
                status = if system[Status] <> "" and not same(system[Status], ci[Status])
                    then {[Field = "status", Label = "Operational status", Current = if ci[Status] = "" then "empty" else ci[Status],
                        Epo = system[Status] & " (" & system[StatusWord] & ")", Value = system[Status], Leftover = false]} else {},
                epoName = system[Name] & config[nameSuffix],
                name = if system[Name] <> "" and not same(ci[Name], epoName)
                    then {[Field = "name", Label = "Name", Current = ci[Name], Epo = epoName, Value = epoName, Leftover = false]} else {},
                people = List.RemoveNulls(List.Transform(compared, (entry) =>
                    let
                        person = fnPerson(ci, entry[role], columns),
                        now = if person = null then "" else Text.Lower(Text.Trim(person[UserId]), "en-US"),
                        epo = Text.Lower(Text.Trim(Record.Field(system, fnPascal(entry[column]))), "en-US"),
                        shown = if now <> "" then fnPersonWords(now, names)
                            else if person <> null and (person[Name] <> "" or person[Email] <> "") then (if person[Name] <> "" then person[Name] else person[Email]) & " (no user ID)"
                            else "nobody"
                    in
                        if now = epo then null
                        else [Field = entry[role], Label = entry[label], Current = shown, Epo = fnPersonWords(epo, names),
                            Value = if epo = "" then "" else Record.FieldOrDefault(names, epo, epo), Leftover = epo = "" and leftovers])),
                kind = if descriptions then descriptionKind(ci, system) else "",
                description = if kind = "" then {}
                    else {[Field = "description", Label = "Description (" & Record.Field(words, kind) & ")",
                        Current = if ci[Description] = "" then "empty" else """" & startOf(ci[Description]) & """",
                        Epo = """" & startOf(system[Description]) & """", Value = system[Description], Leftover = false]},
                differences = status & name & people & description
            in
                if ci = null then [Kind = if epoRetired then "none" else "without", System = system]
                else if epoRetired and isRetired(ci[Status]) then [Kind = "retired"]
                else [Kind = "pair", Pair = [Ci = ci, System = system, Mapped = ci[ServiceMapped], Differences = differences,
                    Leftovers = List.Select(differences, (difference) => difference[Leftover])]],
        results = List.Buffer(List.Transform(systems, pairOf))
    in
        [
            Pairs = List.Buffer(List.Transform(List.Select(results, (result) => result[Kind] = "pair"), (result) => result[Pair])),
            WithoutCi = List.Transform(List.Select(results, (result) => result[Kind] = "without"), (result) => result[System]),
            RetiredBoth = List.Count(List.Select(results, (result) => result[Kind] = "retired")),
            Notes = notes
        ]
