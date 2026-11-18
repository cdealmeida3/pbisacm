// The text of a CI field a rule reads by its check-file name (src/core/checks/engine.ts, text); "" for any other field.
(ci as record, field as text) as text =>
    if field = "description" then ci[Description]
    else if field = "name" then ci[Name]
    else if field = "exception_justification" then ci[ExceptionJustification]
    else if field = "exception_status" then ci[ExceptionStatus]
    else if field = "support_group" then ci[SupportGroup]
    else if field = "operational_status" then ci[Status]
    else ""
