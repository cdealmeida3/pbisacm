// The name of each person of the CI report by their user ID (lower case), the first name found (src/core/sources/epo/
// epo-report.ts, userNames).
(cis as list, columns as list) as record =>
    let
        pairs = List.Combine(List.Transform(cis, (ci) => List.RemoveNulls(List.Transform(ReadingRules[roles], (role) =>
            let person = fnPerson(ci, role, columns) in
            if person = null or person[UserId] = "" or person[Name] = "" then null else [Id = Text.Lower(Text.Trim(person[UserId]), "en-US"), Name = person[Name]])))),
        grouped = fnGroupBy(pairs, (pair) => pair[Id])
    in
        Record.FromList(List.Transform(Record.FieldValues(grouped), (list) => list{0}[Name]), Record.FieldNames(grouped))
