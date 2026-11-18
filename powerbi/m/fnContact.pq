// Who to write to about a finding (src/core/cases/contact.ts, resolveContact; DOMAIN-RULES §5). `audience` is an ordered
// list; the first entry that gives a reachable person wins: a role ("owned_by"), "otherRoles" (the first other filled
// role), "managerOf(<role>)", "departmentHeadOf(<role>)", where "<role>" may be "field" (the role the finding is about).
// The role the finding is about is never the contact, and nobody marked inactive is. The other reachable roles are
// copied (Cc, their emails). Returns [To, Cc]; To is [Name, Email, Id, Via, Above] or null, Above the escalation
// ([Name, Email, Id, Via]) or null.
(ci as record, field as text, audience as list, columns as list) as record =>
    let
        roles = ReadingRules[roles],
        personOf = (role as text) as nullable record => fnPerson(ci, role, columns),
        reachable = (person as nullable record) as logical => person <> null and person[Email] <> "" and person[Active] <> false,
        idOf = (userId as text, email as text) as text => Text.Lower(Text.Trim(if userId <> "" then userId else email), "en-US"),
        words = (role as text) as text => if Text.Contains(role, "_") then Text.BeforeDelimiter(role, "_") & " " & Text.AfterDelimiter(role, "_") else role,
        others = List.Select(roles, (role) => role <> field and reachable(personOf(role))),
        // The manager of a person (when `manager` is true and the manager is active), else the head of their department.
        aboveOf = (person as record, manager as logical) as nullable record =>
            if manager and person[ManagerEmail] <> "" and person[ManagerActive] <> false
                then [Name = person[Manager], Email = person[ManagerEmail], Id = idOf(person[ManagerUserId], person[ManagerEmail]), Via = "manager"]
            else if person[DepartmentHeadEmail] <> ""
                then [Name = person[DepartmentHead], Email = person[DepartmentHeadEmail], Id = idOf(person[DepartmentHeadUserId], person[DepartmentHeadEmail]), Via = "department head"]
            else null,
        // For a person asked as Managed by (D160): the Owned by person of the CI, else the owner's manager or department head.
        managedByAbove = (person as record) as nullable record =>
            let
                owner = personOf("owned_by"),
                self = idOf(person[UserId], person[Email]),
                ownerAbove = if owner <> null and (owner[Email] <> "" or owner[Name] <> "") then aboveOf(owner, true) else null
            in
                if reachable(owner) and idOf(owner[UserId], owner[Email]) <> self then [Name = owner[Name], Email = owner[Email], Id = idOf(owner[UserId], owner[Email]), Via = "owner"]
                else if ownerAbove <> null and ownerAbove[Id] <> self then ownerAbove & [Via = if ownerAbove[Via] = "manager" then "manager of owner" else "department head of owner"]
                else aboveOf(person, true),
        asContact = (role as text) as record =>
            let person = personOf(role) in
            [Name = person[Name], Email = person[Email], Id = idOf(person[UserId], person[Email]), Via = words(role),
                Above = if role = "managed_by" then managedByAbove(person) else aboveOf(person, true)],
        fromEntry = (entry as text) as nullable record =>
            let
                isManager = Text.StartsWith(entry, "managerOf(") and Text.EndsWith(entry, ")") and Text.Length(entry) > 11,
                isHead = Text.StartsWith(entry, "departmentHeadOf(") and Text.EndsWith(entry, ")") and Text.Length(entry) > 18,
                inner = if isManager then Text.Middle(entry, 10, Text.Length(entry) - 11) else if isHead then Text.Middle(entry, 17, Text.Length(entry) - 18) else "",
                role = if inner = "field" then field else inner,
                person = personOf(role),
                label = words(role)
            in
                if isManager then
                    (if person <> null and person[ManagerEmail] <> "" and person[ManagerActive] <> false
                    then [Name = person[Manager], Email = person[ManagerEmail], Id = idOf(person[ManagerUserId], person[ManagerEmail]), Via = "manager of " & label, Above = aboveOf(person, false)]
                    else null)
                else if isHead then
                    (if person <> null and person[DepartmentHeadEmail] <> ""
                    then [Name = person[DepartmentHead], Email = person[DepartmentHeadEmail], Id = idOf(person[DepartmentHeadUserId], person[DepartmentHeadEmail]),
                        Via = "department head of " & label, Above = null]
                    else null)
                else if entry = "otherRoles" then (if List.IsEmpty(others) then null else asContact(others{0}))
                else if List.Contains(others, entry) then asContact(entry)
                else null,
        to = List.Accumulate(audience, null, (found, entry) => if found <> null then found else fromEntry(entry)),
        toEmail = if to = null then "" else Text.Lower(to[Email], "en-US"),
        cc = List.Select(List.Transform(others, (role) => personOf(role)[Email]), (email) => Text.Lower(email, "en-US") <> toEmail)
    in
        [To = to, Cc = cc]
