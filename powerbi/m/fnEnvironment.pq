// The environment of a Service Instance (src/core/checks/detectors/relationship-detectors.ts, environmentOf): its
// Environment field, else a trailing word of its name ("Index - TEST"), else production; synonyms count as one
// (reference/relationship-model, environments). The suffix pattern is "\b(<words>)\)?\s*$": the word is the rest of the
// trimmed name from where the pattern matches, without the ")" (the generator refuses another form of pattern).
(name as text, field as text, model as record) as text =>
    let
        rules = Record.FieldOrDefault(model, "environments", null),
        trimmed = Text.Trim(name),
        found = if rules = null then [Index = -1] else fnSearch(rules[suffix], "i", trimmed),
        rest = if found[Index] < 0 then "" else Text.Middle(trimmed, found[Index]),
        word = if Text.EndsWith(rest, ")") then Text.Start(rest, Text.Length(rest) - 1) else rest,
        raw = if Text.Trim(field) <> "" then Text.Trim(field) else if word <> "" then word else "PROD",
        alias = if rules = null then null else List.First(List.Select(Record.FieldOrDefault(rules, "aliases", {}), (entry) => fnMatches(entry[pattern], "i", raw)), null)
    in
        if alias <> null then alias[name] else Text.Upper(raw, "en-US")
