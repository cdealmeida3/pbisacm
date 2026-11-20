// The part PeopleCheck of the table Run (build R3), which the DAX table PeopleCheck of the page Data check shows: for
// Owned by, Managed by, Supported by and the manager of Owned by (the escalation), how many CIs of the newest CI report
// name a person, with an email, with a user ID, marked active or inactive, and named with no word on active
// (src/core/sources/ci/ci-report.ts, peopleCoverage). InReport: Yes when the report has the column of the role, else No column. No rows when no
// CI report is loaded. `run` is CheckRun.
(run as nullable record) as table =>
    let
        cis = if run = null then {} else run[Cis],
        columns = if run = null then {} else run[Columns],
        roles = {
            [Role = "owned_by", Label = "Owned by", Of = "owned_by", Manager = false], [Role = "managed_by", Label = "Managed by", Of = "managed_by", Manager = false],
            [Role = "supported_by", Label = "Supported by", Of = "supported_by", Manager = false], [Role = "owned_by.manager", Label = "Manager of Owned by", Of = "owned_by", Manager = true]
        },
        row = (at as number) as list =>
            let
                entry = roles{at},
                people = List.Buffer(List.Transform(cis, (ci) =>
                    let person = fnPerson(ci, entry[Of], columns) in
                    if person = null then null
                    else if entry[Manager] then [Name = person[Manager], Email = person[ManagerEmail], UserId = person[ManagerUserId], Active = person[ManagerActive]]
                    else [Name = person[Name], Email = person[Email], UserId = person[UserId], Active = person[Active]])),
                named = List.Buffer(List.RemoveNulls(people)),
                count = (test as function) as number => List.Count(List.Select(named, test))
            in
                {
                    at + 1, entry[Role], entry[Label], if List.Contains(columns, entry[Role]) then "Yes" else "No column", List.Count(cis),
                    count((person) => person[Name] <> ""), count((person) => person[Email] <> ""), count((person) => person[UserId] <> ""),
                    count((person) => person[Active] = true), count((person) => person[Active] = false),
                    count((person) => (person[Name] <> "" or person[Email] <> "") and person[Active] = null)
                }
    in
        #table(
            type table [Order = Int64.Type, Role = text, Label = text, InReport = text, CIs = Int64.Type, WithName = Int64.Type, WithEmail = Int64.Type,
                WithUserId = Int64.Type, Active = Int64.Type, Inactive = Int64.Type, NotSaid = Int64.Type],
            if run = null then {} else List.Transform(List.Positions(roles), row))
