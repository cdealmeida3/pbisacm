// Table Settings (D291): the rows of the list SACM Settings, and the two numbers the cases use (CaseRules): a value that
// is not a whole number in its range is not used, so the page says which value counts.
let
    rows = Table.ToRecords(fnStateList("settings")),
    used = [reminderDays = CaseRules[ReminderDays], maxReminders = CaseRules[MaxReminders]],
    lines = List.Transform(rows, (row) => {row[Title], row[Value],
        if Record.HasFields(used, row[Title]) then Text.From(Record.Field(used, row[Title])) else row[Value],
        if Record.HasFields(used, row[Title]) and Text.Trim(row[Value]) <> Text.From(Record.Field(used, row[Title])) then
            "Not used: a whole number from " & Text.From(Record.Field(SettingRanges, row[Title])[min]) & " to " & Text.From(Record.Field(SettingRanges, row[Title])[max]) & ". The default counts."
        else ""})
in
    #table(type table [Key = text, Value = text, Used = text, Note = text], lines)
