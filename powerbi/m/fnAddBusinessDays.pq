// A date plus a number of working days, Monday to Friday (src/core/shared/dates.ts, addBusinessDays): Friday plus 1 is
// Monday. When a reminder is due (D39).
(start as date, days as number) as date =>
    List.Accumulate(List.Numbers(1, days), start, (day, step) =>
        let next = Date.AddDays(day, 1), weekday = Date.DayOfWeek(next, Day.Monday) in
        if weekday >= 5 then Date.AddDays(next, 7 - weekday) else next)
