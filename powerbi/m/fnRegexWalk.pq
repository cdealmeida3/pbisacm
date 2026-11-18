// The places in the text where a compiled pattern (the query Patterns, tools/powerbi/regex.ts) can end, when it starts at
// one of `starts`. The walk keeps the set of places in the text the pattern can reach, part after part. Read by
// fnRegexTest (RegExp.test of JavaScript) and fnSearch (String.search).
(tree as list, value as text, starts as list) as list =>
    let
        codes = List.Buffer(List.Transform(Text.ToList(value), Character.ToNumber)),
        size = List.Count(codes),
        isWord = (at as number) as logical =>
            at >= 0 and at < size and (let code = codes{at} in (code >= 48 and code <= 57) or (code >= 65 and code <= 90) or code = 95 or (code >= 97 and code <= 122)),
        inRanges = (ranges as list, code as number) as logical =>
            List.AnyTrue(List.Transform(List.Numbers(0, List.Count(ranges) / 2, 2), (at) => code >= ranges{at} and code <= ranges{at + 1})),
        // Each step is buffered: a list of M is worked out again each time it is read, and the walk reads each one often.
        step = (node as list, from as list) as list => List.Buffer(walk(node, from)),
        walk = (node as list, from as list) as list =>
            let
                kind = node{0}
            in
                if List.IsEmpty(from) then from
                else if kind = "c" then List.Transform(List.Select(from, (at) => at < size and (inRanges(node{1}, codes{at}) <> (node{2} = 1))), (at) => at + 1)
                else if kind = "s" then List.Accumulate(node{1}, from, (places, part) => step(part, places))
                else if kind = "a" then List.Sort(List.Distinct(List.Combine(List.Transform(node{1}, (part) => step(part, from)))))
                else if kind = "^" then List.Select(from, (at) => at = 0)
                else if kind = "$" then List.Select(from, (at) => at = size)
                else if kind = "b" then List.Select(from, (at) => isWord(at - 1) <> isWord(at))
                else if kind = "B" then List.Select(from, (at) => isWord(at - 1) = isWord(at))
                else if kind = "r" then
                    let
                        low = node{1},
                        high = node{2},
                        part = node{3},
                        first = List.Accumulate(List.Numbers(1, low), from, (places, count) => step(part, places)),
                        states = List.Generate(
                            () => [All = first, Frontier = first, Count = low],
                            (state) => state <> null,
                            (state) =>
                                if List.IsEmpty(state[Frontier]) or (high >= 0 and state[Count] >= high) then null
                                else
                                    let
                                        next = List.Buffer(List.Difference(step(part, state[Frontier]), state[All]))
                                    in
                                        [All = List.Buffer(List.Sort(List.Union({state[All], next}))), Frontier = next, Count = state[Count] + 1],
                            (state) => state[All])
                    in
                        List.Last(states)
                else error "Unknown part of a pattern: " & kind
    in
        step(tree, starts)
