// The date of a report: the yyyy-MM-dd_ at the start of its file name (flow F1 writes it), else the day the file was
// last changed (D12, src/core/memory/finder.ts). One difference: a date that does not exist (2026-02-30_) is kept as
// text by the app, but Power BI cannot hold it, so the day the file changed is used.
(name as text, modified as nullable datetime) as nullable date =>
    let
        digits = (from as number, count as number) as logical =>
            List.AllTrue(List.Transform(Text.ToList(Text.Middle(name, from, count)), (char) => char >= "0" and char <= "9")),
        shaped = Text.Length(name) >= 11 and digits(0, 4) and Text.Middle(name, 4, 1) = "-" and digits(5, 2)
            and Text.Middle(name, 7, 1) = "-" and digits(8, 2) and Text.Middle(name, 10, 1) = "_",
        month = if shaped then Number.From(Text.Middle(name, 5, 2)) else 0,
        day = if shaped then Number.From(Text.Middle(name, 8, 2)) else 0,
        fromName = if month >= 1 and month <= 12 and day >= 1 and day <= 31
            then try #date(Number.From(Text.Start(name, 4)), month, day) otherwise null else null
    in
        if fromName <> null then fromName else if modified = null then null else DateTime.Date(modified)
