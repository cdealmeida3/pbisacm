// Does the text match the pattern, decided by its fast form (the query PatternForms, D285) when it can, else by the walk
// (fnRegexTest)? exact, prefix, suffix, contains: the text is one of the words, starts, ends with or holds one of them.
// only: the length is in range and every character is one of Chars. walk: a quick "no" when the text holds a character
// a match cannot (Allowed), or does not start or end with a word a match needs (Starts, Ends); then the walk. Lower: the
// words are lower case, so the text is compared in lower case, and only an ASCII text is decided so (JavaScript's "i"
// never matches a non-ASCII character to an ASCII one); any other text goes to the walk.
(form as record, tree as list, value as text) as logical =>
    let
        kind = form[Kind],
        lower = form[Lower],
        usable = not lower or Text.Remove(value, AsciiCharacters) = "",
        text = if lower then Text.Lower(value, "en-US") else value,
        oneOf = (words as nullable list, test as function) as logical => words = null or List.AnyTrue(List.Transform(words, test)),
        words = Record.FieldOrDefault(form, "Words", null),
        allowed = Record.FieldOrDefault(form, "Allowed", null)
    in
        if kind = "only" then
            Text.Length(value) >= form[Min] and (form[Max] < 0 or Text.Length(value) <= form[Max]) and Text.Remove(value, form[Chars]) = ""
        else if kind = "walk" then
            if allowed <> null and Text.Remove(value, allowed) <> "" then false
            else if usable and not oneOf(Record.FieldOrDefault(form, "Starts", null), (word) => Text.StartsWith(text, word)) then false
            else if usable and not oneOf(Record.FieldOrDefault(form, "Ends", null), (word) => Text.EndsWith(text, word)) then false
            else fnRegexTest(tree, value)
        else if not usable then fnRegexTest(tree, value)
        else if kind = "exact" then List.Contains(words, text)
        else if kind = "prefix" then oneOf(words, (word) => Text.StartsWith(text, word))
        else if kind = "suffix" then oneOf(words, (word) => Text.EndsWith(text, word))
        else oneOf(words, (word) => Text.Contains(text, word))
