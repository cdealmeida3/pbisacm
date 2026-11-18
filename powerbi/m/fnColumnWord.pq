// The label of a report column as the report layout names it, for a note: "supported_by.active" is "Supported by
// (active)", "target.availability" is "Target availability" (src/core/shared/text.ts, columnWord).
(column as text) as text =>
    let
        words = ReadingRules[columnWords],
        dot = Text.PositionOf(column, "."),
        head = if dot < 0 then column else Text.Start(column, dot),
        rest = if dot < 0 then "" else Text.Middle(column, dot + 1),
        role = Record.FieldOrDefault(words[roles], head, null),
        part = Record.FieldOrDefault(words[parts], rest, Text.Replace(Text.Replace(rest, ".", " "), "_", " ")),
        spaced = Text.Replace(Text.Replace(column, ".", " "), "_", " "),
        chars = Text.ToList(spaced),
        // A space between a lower case letter and the capital after it ("supportGroup" -> "support Group").
        split = Text.Combine(List.Transform(List.Positions(chars), (at) =>
            let before = if at > 0 then Character.ToNumber(chars{at - 1}) else 0, code = Character.ToNumber(chars{at}) in
            if before >= 97 and before <= 122 and code >= 65 and code <= 90 then " " & chars{at} else chars{at})),
        lower = Text.Lower(split, "en-US")
    in
        if Record.HasFields(words[columns], column) then Record.Field(words[columns], column)
        else if role <> null then (if rest <> "" then role & " (" & part & ")" else role)
        else if (head = "target" or head = "inherited") and rest <> "" then (if head = "target" then "Target" else "Inherited") & " " & rest
        else fnCapital(lower)
