// The name with "?" where a hidden character is, as the CSV export shows it, so a person can see where it sits
// (src/core/shared/names.ts, visibleName).
(name as text) as text => List.Accumulate(ReadingRules[hiddenCharacters], name, (text, entry) => Text.Replace(text, Character.FromNumber(entry[code]), "?"))
