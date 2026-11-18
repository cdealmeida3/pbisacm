// The rules of the cases from the list SACM Settings (D158, D291): the working days before a reminder is due and how many
// reminders before an escalation. A value that is not a whole number in its range (SettingRanges) is not used: the
// default is, as the app does.
let
    rows = Table.ToRecords(fnStateList("settings")),
    value = (key as text) as number =>
        let
            range = Record.Field(SettingRanges, key),
            found = List.First(List.Select(rows, (row) => row[Title] = key), null),
            raw = if found = null then "" else Text.Trim(found[Value]),
            digits = if Text.StartsWith(raw, "-") then Text.Middle(raw, 1) else raw,
            number = if digits <> "" and Text.Remove(digits, {"0".."9"}) = "" then Number.FromText(raw, "en-US") else null
        in
            if number <> null and number >= range[min] and number <= range[max] then number else range[default]
in
    [ReminderDays = value("reminderDays"), MaxReminders = value("maxReminders")]
