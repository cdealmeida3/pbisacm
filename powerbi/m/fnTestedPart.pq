// The part Tested of the table Run (D284), which the DAX table Tested shows: each part of a check the newest CI report
// could test, with the CIs it evaluated (D15). A card with no row here is grey, never green. Part: the field or rule
// ("owned_by", "outer-space"), as the HTML app's run says it; "" for a check tested as a whole (Process stage). `run`
// is CheckRun (null when no CI report is loaded).
(run as nullable record) as table =>
    let
        evaluated = if run = null then {} else run[Evaluated],
        tested = if run = null then {} else run[Tested],
        countOf = (part as text) as nullable number => List.First(List.Transform(List.Select(evaluated, (entry) => entry[Part] = part), (entry) => entry[Count]), null)
    in
        #table(
            type table [CheckId = text, Part = text, ReportDate = date, Evaluated = Int64.Type],
            List.Transform(tested, (part) =>
                let at = Text.PositionOf(part, ":") in
                {if at < 0 then part else Text.Start(part, at), if at < 0 then "" else Text.Middle(part, at + 1), run[Date], countOf(part)}))
