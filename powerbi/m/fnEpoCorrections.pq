// "Corrected in EPO" (src/app/view/cases.ts, epoCorrection, and src/core/sources/epo/epo-report.ts, correctedInEpo): for
// each fact, in the same order, what the case says when the fix is made in EPO and the EPO systems report of the run
// shows another person in the role than ServiceNow; "" when there is nothing to say. Until the team's journal is read
// (build B5) no message is known, so it is always the words for a case nobody was asked about yet: "EPO already has …".
// Only shown: nothing is sent and nothing is changed.
(facts as list, run as record) as list =>
    let
        epo = run[Epo],
        config = let found = fnReference("reference/epo-systems-report") in if found <> null and Value.Is(Record.FieldOrDefault(found, "roles", null), type list) then found else null,
        columns = run[Columns],
        ciByKey = Record.FromList(run[Cis], List.Transform(run[Cis], (ci) => ci[Key])),
        roles = {"owned_by", "managed_by", "supported_by"},
        // The people of a CI as the case shows them (src/app/view/people.ts): a role with a name or an email; its id is
        // the user ID, else the email, else the name, in lower case.
        personOf = (ci as record, role as text) as nullable record =>
            let
                person = fnPerson(ci, role, columns),
                lower = (text as text) as text => Text.Lower(Text.Trim(text), "en-US"),
                id = if person = null then "" else if person[UserId] <> "" then lower(person[UserId]) else lower(person[Email])
            in
                if person = null or (person[Name] = "" and person[Email] = "") then null
                else [Id = if id <> "" then id else Text.Lower(person[Name], "en-US"), Name = if person[Name] <> "" then person[Name] else person[Email]],
        // The people the app keeps with the run: of every CI with a finding and of every CI of the inventory (not parked).
        // Both as key sets (fnKeySet), made once: the CIs that are not parked (fnCheckRun) and the CIs with a finding.
        kept = run[CheckableKeys],
        withFinding = fnKeySet(List.Transform(facts, (fact) => fact[CiKey])),
        withPeople = List.Distinct(List.Select(List.Transform(run[Cis], (ci) => ci[Key]), (key) => Record.HasFields(withFinding, key) or Record.HasFields(kept, key))),
        named = List.Combine(List.Transform(withPeople, (key) => List.RemoveNulls(List.Transform(roles, (role) => personOf(Record.Field(ciByKey, key), role))))),
        grouped = fnGroupBy(named, (person) => person[Id]),
        names = Record.FromList(List.Transform(Record.FieldValues(grouped), (list) => list{0}[Name]), Record.FieldNames(grouped)),
        systems = if epo = null then [] else
            let byId = fnGroupBy(epo[Systems], (system) => Text.Lower(Text.Trim(system[EpoId]), "en-US")) in
            Record.FromList(List.Transform(Record.FieldValues(byId), List.Last), Record.FieldNames(byId)),
        textOf = (fact as record) as text =>
            let
                system = if fact[EpoId] = "" then null else Record.FieldOrDefault(systems, Text.Lower(Text.Trim(fact[EpoId]), "en-US"), null),
                role = List.First(List.Select(config[roles], (entry) => entry[role] = fact[Field]), null),
                epoId = if role = null or system = null then "" else Text.Lower(Text.Trim(Record.Field(system, fnPascal(role[column]))), "en-US"),
                person = if role = null or not List.Contains(roles, fact[Field]) then null else personOf(Record.Field(ciByKey, fact[CiKey]), fact[Field]),
                now = if person = null then "" else person[Id]
            in
                if fact[Route] = "" or system = null or system[Changed] = null or role = null or epoId = "" or epoId = now then ""
                else "EPO already has " & role[epoLabel] & " " & fnPersonWords(epoId, names) & " (last change in EPO: " & fnLongDate(system[Changed])
                    & "), so nobody needs to be asked. ServiceNow receives it from EPO (for a service mapped CI, SACM copies it: fix list of ""EPO ≠ ServiceNow"")."
    in
        if epo = null or config = null then List.Transform(facts, (fact) => "") else List.Transform(facts, textOf)
