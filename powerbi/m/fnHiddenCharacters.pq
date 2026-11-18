// The hidden characters in a name, as readable labels ("zero-width space (U+200B)"), each once, in the order they come
// (src/core/shared/names.ts, hiddenCharacters).
(name as text) as list =>
    let
        entries = ReadingRules[hiddenCharacters],
        found = List.Select(Text.ToList(name), (char) => List.Contains(List.Transform(entries, (entry) => entry[code]), Character.ToNumber(char))),
        labelOf = (char as text) as text =>
            let entry = List.First(List.Select(entries, (item) => item[code] = Character.ToNumber(char))) in
            entry[label] & " (U+" & Text.PadStart(Number.ToText(entry[code], "X"), 4, "0") & ")"
    in
        List.Distinct(List.Transform(found, labelOf))
