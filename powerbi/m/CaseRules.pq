// The numbers of the team's settings from the list SACM Settings (D158, D291): the working days before a reminder is
// due, how many reminders before an escalation, the days before a report is old, the months to the review date of a
// decision to stop following, and the days a CI may stay Under retirement or Ready (build B8, D308). A value that is not
// a whole number in its range (SettingRanges) is not used: the default is, as the app does. The Settings screen of the
// Power App adds a row for each change and never changes one, so the last row of a setting counts (the list is read
// oldest first).
let
    rows = Table.ToRecords(fnStateList("settings")),
    value = (key as text) as number =>
        let
            range = Record.Field(SettingRanges, key),
            found = List.Last(List.Select(rows, (row) => row[Title] = key), null),
            raw = if found = null then "" else Text.Trim(found[Value]),
            digits = if Text.StartsWith(raw, "-") then Text.Middle(raw, 1) else raw,
            number = if digits <> "" and Text.Remove(digits, {"0".."9"}) = "" then Number.FromText(raw, "en-US") else null
        in
            if number <> null and number >= range[min] and number <= range[max] then number else range[default]
in
    [
        ReminderDays = value("reminderDays"), MaxReminders = value("maxReminders"), StaleDays = value("staleDays"),
        ExceptionMonths = value("exceptionMonths"), UnderRetirementDays = value("underRetirementDays"), ReadyDays = value("readyDays")
    ]
