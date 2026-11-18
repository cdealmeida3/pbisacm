// A criticality value of a CI by its check-file name ("target.availability"); null when not set or not such a name.
(ci as record, field as text) as nullable number =>
    let
        parts = Text.Split(field, ".")
    in
        if List.Count(parts) = 2 and List.Contains({"target", "inherited"}, parts{0}) and List.Contains(ReadingRules[dimensions], parts{1})
        then Record.FieldOrDefault(ci, fnPascal(parts{0}) & fnPascal(parts{1}), null)
        else null
