// The same person (relationship-detectors.ts, samePerson): user ID first, then email, then (only when neither is known)
// the display name. Two empty roles are the same. `a` and `b` are records of fnPerson, or null.
(a as nullable record, b as nullable record) as logical =>
    let
        filled = (person as nullable record) as logical => person <> null and (person[Name] <> "" or person[Email] <> "" or person[UserId] <> ""),
        lower = (text as text) as text => Text.Lower(text, "en-US")
    in
        if not filled(a) or not filled(b) then filled(a) = filled(b)
        else if a[UserId] <> "" and b[UserId] <> "" then lower(a[UserId]) = lower(b[UserId])
        else if a[Email] <> "" and b[Email] <> "" then lower(a[Email]) = lower(b[Email])
        else fnNameKey(a[Name], "") = fnNameKey(b[Name], "")
