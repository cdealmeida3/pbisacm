// The rules of the relationship model a check runs (relationship-detectors.ts, chosen): those its detector names in
// `rules`, in the order of the model, else every rule.
(pack as record, rules as list) as list =>
    let names = Record.FieldOrDefault(pack[detector], "rules", null) in
    if names = null then rules else List.Select(rules, (rule) => List.Contains(names, rule[id]))
