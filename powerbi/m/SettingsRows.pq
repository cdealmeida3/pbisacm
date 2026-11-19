// Table Settings (D291): the settings of the list SACM Settings, one row per setting (Key): the value of its last row,
// as the Settings screen of the Power App adds a row for each change (build B8, D308), and for the seven numbers (the six
// of CaseRules and rowsInEmail of the emails, D314) the value
// that counts (CaseRules): a value that is not a whole number in its range is not used, so the page says which value counts.
let
    rows = List.Select(Table.ToRecords(fnStateList("settings")), (row) => Text.Trim(row[Title]) <> ""),
    keys = List.Distinct(List.Transform(rows, (row) => Text.Trim(row[Title]))),
    used = [
        reminderDays = CaseRules[ReminderDays], maxReminders = CaseRules[MaxReminders], staleDays = CaseRules[StaleDays],
        exceptionMonths = CaseRules[ExceptionMonths], underRetirementDays = CaseRules[UnderRetirementDays], readyDays = CaseRules[ReadyDays],
        rowsInEmail = MessageSettings[RowsInEmail]
    ],
    lines = List.Transform(keys, (key) =>
        let
            row = List.Last(List.Select(rows, (candidate) => Text.Trim(candidate[Title]) = key)),
            number = Record.HasFields(used, key),
            counted = if number then Text.From(Record.Field(used, key)) else row[Value],
            range = if number then Record.Field(SettingRanges, key) else null
        in
            {key, row[Value], counted,
                if number and Text.Trim(row[Value]) <> counted then
                    "Not used: a whole number from " & Text.From(range[min]) & " to " & Text.From(range[max]) & ". The default counts."
                else ""})
in
    #table(type table [Key = text, Value = text, Used = text, Note = text], lines)
