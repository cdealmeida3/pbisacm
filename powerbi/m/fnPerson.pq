// A person of a CI by role (owned_by, managed_by, supported_by, assigned_to), as src/core/sources/ci/ci-report.ts reads
// it: null when the report has no column for the role. Active and ManagerActive are null when the report does not say.
(ci as record, role as text, columns as list) as nullable record =>
    let
        prefix = fnPascal(role),
        get = (part as text) as any => Record.FieldOrDefault(ci, prefix & part, null),
        text = (part as text) as text => let value = get(part) in if value = null then "" else value
    in
        if not List.Contains(ReadingRules[roles], role) or not List.Contains(columns, role) then null
        else [
            Name = text(""), Email = text("Email"), UserId = text("UserId"), Active = get("Active"),
            Manager = text("Manager"), ManagerEmail = text("ManagerEmail"), ManagerUserId = text("ManagerUserId"), ManagerActive = get("ManagerActive"),
            DepartmentHead = text("DepartmentHead"), DepartmentHeadEmail = text("DepartmentHeadEmail"), DepartmentHeadUserId = text("DepartmentHeadUserId")
        ]
