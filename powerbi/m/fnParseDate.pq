// A date of a report: "2026-06-10 10:35:59", "10-06-2026", "10/06/2026 10:35" (day first), or the serial number Excel
// keeps. null when empty or not a date, so a check can say what it could not read (src/core/shared/dates.ts, reportDate).
(value as text) as nullable date =>
    let
        text = Text.Trim(value),
        isIso = Text.Length(text) >= 10 and Text.Middle(text, 4, 1) = "-" and Text.Middle(text, 7, 1) = "-"
            and fnDigits(Text.Start(text, 4)) and fnDigits(Text.Middle(text, 5, 2)) and fnDigits(Text.Middle(text, 8, 2)),
        iso = try #date(Number.From(Text.Start(text, 4)), Number.From(Text.Middle(text, 5, 2)), Number.From(Text.Middle(text, 8, 2))) otherwise null,
        firstWord = Text.BeforeDelimiter(text, " "),
        parts = Text.SplitAny(firstWord, "-/."),
        isDayFirst = List.Count(parts) >= 3 and fnDigits(parts{0}) and Text.Length(parts{0}) <= 2
            and fnDigits(parts{1}) and Text.Length(parts{1}) <= 2 and Text.Length(parts{2}) >= 4 and fnDigits(Text.Start(parts{2}, 4))
            and (Text.Length(parts{2}) = 4 or List.Count(parts) = 3),
        dayFirst = try #date(Number.From(Text.Start(parts{2}, 4)), Number.From(parts{1}), Number.From(parts{0})) otherwise null,
        serialParts = Text.Split(text, "."),
        isSerial = Text.Length(serialParts{0}) = 5 and fnDigits(serialParts{0})
            and (List.Count(serialParts) = 1 or (List.Count(serialParts) = 2 and fnDigits(serialParts{1}))),
        serial = Date.AddDays(#date(1899, 12, 30), Number.From(serialParts{0}))
    in
        if isIso then iso else if isDayFirst then dayFirst else if isSerial then serial else null
