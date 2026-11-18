// The HTML of an EPO description as plain text (src/core/sources/epo/epo-report.ts, plainText): "{Q}" (how the export
// writes a quote in an attribute) is a quote again, a line break or the end of a paragraph, a block or a heading is a
// space, every other tag is left out, the entities are decoded (&amp; &lt; &gt; &quot; &apos; &nbsp; and numbers), and
// runs of spaces are one space. The same steps, in the same order, as the regular expressions there. A number that is no
// character of its own (a half of a surrogate pair) is kept as it is written.
(html as text) as text =>
    let
        isWord = (char as text) as logical =>
            let code = Character.ToNumber(char) in (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or code = 95 or (code >= 97 and code <= 122),
        // After "<": br, /p, /div, /li or /h and a digit, then no letter, digit or "_" (the \b of the pattern).
        isBlock = (after as text) as logical =>
            let
                lower = Text.Lower(after, "en-US"),
                ends = (length as number) as logical => Text.Length(after) = length or not isWord(Text.At(after, length)),
                heading = Text.StartsWith(lower, "/h") and Text.Length(lower) > 2 and Text.Contains("0123456789", Text.At(lower, 2)) and ends(3)
            in
                heading or List.AnyTrue(List.Transform({"br", "/p", "/div", "/li"}, (word) => Text.StartsWith(lower, word) and ends(Text.Length(word)))),
        // One pass over the text: at each "<" that `takes` (and that has a ">" after it), the tag up to the first ">" becomes `with`.
        tags = (text as text, takes as function, with as text) as text =>
            let
                steps = List.Generate(
                    () => [Out = "", Rest = text, Done = false],
                    (state) => state <> null,
                    (state) =>
                        if state[Done] then null
                        else
                            let
                                rest = state[Rest],
                                starts = List.Select(Text.PositionOfAny(rest, {"<"}, Occurrence.All), (at) => takes(Text.Middle(rest, at + 1)) and Text.PositionOf(Text.Middle(rest, at + 1), ">") >= 0),
                                at = List.First(starts, -1),
                                close = if at < 0 then -1 else at + 1 + Text.PositionOf(Text.Middle(rest, at + 1), ">")
                            in
                                if at < 0 then [Out = state[Out] & rest, Rest = "", Done = true]
                                else [Out = state[Out] & Text.Start(rest, at) & with, Rest = Text.Middle(rest, close + 1), Done = false],
                    (state) => state)
            in
                List.Last(steps)[Out],
        hex = "0123456789abcdef",
        allIn = (text as text, chars as text) as logical => List.AllTrue(List.Transform(Text.ToList(text), (char) => Text.Contains(chars, char))),
        letters = "abcdefghijklmnopqrstuvwxyz",
        named = [amp = "&", lt = "<", gt = ">", quot = """", apos = "'", nbsp = " "],
        // The text of an entity ("amp", "#38", "#x26"), or null when it is none.
        decode = (code as text) as nullable text =>
            let
                lower = Text.Lower(code, "en-US"),
                body = Text.Middle(lower, 1),
                isNumber = Text.StartsWith(lower, "#") and ((Text.StartsWith(body, "x") and Text.Length(body) > 1 and allIn(Text.Middle(body, 1), hex)) or (body <> "" and allIn(body, hex))),
                isName = lower <> "" and allIn(lower, letters),
                digits = Text.Combine(List.FirstN(Text.ToList(body), each Text.Contains("0123456789", _))),
                value =
                    if Text.StartsWith(body, "x") then List.Accumulate(Text.ToList(Text.Middle(body, 1)), 0, (sum, char) => sum * 16 + Text.PositionOf(hex, char))
                    else if digits = "" then 0 else Number.FromText(digits, "en-US")
            in
                if isNumber then (if value > 0 and value <= 1114111 and (value < 55296 or value > 57343) then Character.FromNumber(value) else null)
                else if isName then Record.FieldOrDefault(named, lower, null)
                else null,
        entities = (text as text) as text =>
            let
                steps = List.Generate(
                    () => [Out = "", Rest = text, Done = false],
                    (state) => state <> null,
                    (state) =>
                        if state[Done] then null
                        else
                            let
                                rest = state[Rest],
                                at = Text.PositionOf(rest, "&"),
                                after = if at < 0 then "" else Text.Middle(rest, at + 1),
                                semi = Text.PositionOf(after, ";"),
                                code = if semi < 0 then "" else Text.Start(after, semi),
                                // Only letters, digits, "#" and "x" can be in an entity: the first ";" ends it, or it is none.
                                found = if semi < 0 then null else decode(code)
                            in
                                if at < 0 then [Out = state[Out] & rest, Rest = "", Done = true]
                                else if found = null then [Out = state[Out] & Text.Start(rest, at + 1), Rest = after, Done = false]
                                else [Out = state[Out] & Text.Start(rest, at) & found, Rest = Text.Middle(after, semi + 1), Done = false],
                    (state) => state)
            in
                List.Last(steps)[Out],
        // JavaScript's \s and the no-break space.
        spaces = List.Transform({9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279}, Character.FromNumber),
        quoted = Text.Replace(html, "{Q}", """"),
        blocks = tags(quoted, isBlock, " "),
        bare = tags(blocks, (after) => true, ""),
        decoded = entities(bare),
        words = List.Select(Text.SplitAny(decoded, Text.Combine(spaces)), (part) => part <> "")
    in
        Text.Combine(words, " ")
