// The name without its hidden characters: the name to type in ServiceNow (src/core/shared/names.ts, withoutHidden).
(name as text) as text => List.Accumulate(ReadingRules[hiddenCharacters], name, (text, entry) => Text.Replace(text, Character.FromNumber(entry[code]), ""))
