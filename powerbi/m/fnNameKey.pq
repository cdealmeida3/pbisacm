// A name as it is compared: hidden characters (zero-width space, zero-width non-joiner, zero-width joiner, byte order
// mark) replaced by `hiddenAs`, a non-breaking space as a space, trimmed, lower case, runs of spaces squashed
// (src/core/shared/names.ts: nameKey with "", identityKey with "?").
(name as text, hiddenAs as text) as text =>
    let
        hidden = List.Transform({8203, 8204, 8205, 65279}, Character.FromNumber),
        visible = List.Accumulate(hidden, name, (text, char) => Text.Replace(text, char, hiddenAs)),
        spaced = Text.Replace(visible, Character.FromNumber(160), " "),
        lower = Text.Lower(Text.Trim(spaced), "en-US")
    in
        Text.Combine(List.Select(Text.SplitAny(lower, " #(tab)#(cr)#(lf)"), each _ <> ""), " ")
