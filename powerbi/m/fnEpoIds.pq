// The EPO IDs written in the EPO ID column of Solusi (free text; src/core/checks/detectors/contract-detectors.ts,
// epoIdsOf): every match of /[A-Za-z]*-?\d+/ from left to right whose digits are at least `minDigits` long, each number
// once. Returns a list of [Written, Digits]: Written keeps the letters in front ("AST-0006"), because an EPO ID can be
// more than digits. Read character by character: the letters (ASCII), then "-" and digits, or digits.
(text as text, minDigits as number) as list =>
    let
        chars = List.Buffer(Text.ToList(text)),
        count = List.Count(chars),
        isLetter = (at as number) as logical => at < count and ((chars{at} >= "A" and chars{at} <= "Z") or (chars{at} >= "a" and chars{at} <= "z")),
        isDigit = (at as number) as logical => at < count and chars{at} >= "0" and chars{at} <= "9",
        runOf = (at as number, test as function) as number => List.Last(List.Generate(() => at, (position) => test(position), (position) => position + 1, (position) => position + 1), at),
        // The match that starts at `at`, as [Start, Digits, End], or null.
        matchAt = (at as number) as nullable record =>
            let
                lettersEnd = runOf(at, isLetter),
                dash = lettersEnd < count and chars{lettersEnd} = "-" and isDigit(lettersEnd + 1),
                digitsStart = if dash then lettersEnd + 1 else lettersEnd,
                digitsEnd = runOf(digitsStart, isDigit)
            in
                if dash or isDigit(lettersEnd) then [Start = at, DigitsStart = digitsStart, End = digitsEnd] else null,
        matches = List.Generate(
            () => [At = 0, Found = null],
            (state) => state[At] <= count,
            (state) => let found = matchAt(state[At]) in if found = null then [At = state[At] + 1, Found = null] else [At = found[End], Found = found],
            (state) => state[Found]),
        found = List.Transform(List.RemoveNulls(matches), (match) =>
            [Written = Text.Combine(List.Range(chars, match[Start], match[End] - match[Start])), Digits = Text.Combine(List.Range(chars, match[DigitsStart], match[End] - match[DigitsStart]))]),
        long = List.Select(found, (id) => Text.Length(id[Digits]) >= List.Max({1, minDigits}))
    in
        List.Accumulate(long, {}, (kept, id) => if List.Contains(List.Transform(kept, (item) => item[Digits]), id[Digits]) then kept else kept & {id})
