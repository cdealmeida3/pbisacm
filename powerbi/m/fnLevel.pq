// A criticality level 1 to 4 from a number or a label; null when not set or not known (src/core/sources/ci/ci-report.ts, level).
// "business critical" may have spaces, tabs or dashes between the two words, as /business[\s-]*critical/.
(value as text) as nullable number =>
    let
        text = Text.Lower(Text.Trim(value), "en-US"),
        isNone = text = "" or List.Contains({"none", "na", "n/a", "unknown"}, text) or Text.StartsWith(text, "not ")
            or List.AllTrue(List.Transform(Text.ToList(text), (char) => char = "-")),
        gaps = {" ", "-", "#(tab)", "#(lf)", "#(cr)", "#(00A0)"},
        businessCritical = List.AnyTrue(List.Transform(Text.PositionOf(text, "business", Occurrence.All),
            (at) => Text.StartsWith(Text.TrimStart(Text.Middle(text, at + 8), gaps), "critical")))
    in
        if List.Contains({"1", "2", "3", "4"}, text) then Number.From(text)
        else if isNone then null
        else if Text.Contains(text, "mission") or businessCritical then 4
        else if Text.StartsWith(text, "less") or Text.StartsWith(text, "low") or Text.StartsWith(text, "minor") then 1
        else if Text.Contains(text, "critical") or Text.Contains(text, "vital") then 3
        else if Text.Contains(text, "significant") or Text.Contains(text, "necessary") then 2
        else null
