// The text with the first match of a pattern replaced (String.replace of JavaScript with a regular expression, without
// "g"), for the patterns that end with "$" (see fnSearch).
(pattern as text, flags as text, value as text, new as text) as text =>
    let found = fnSearch(pattern, flags, value) in
    if found[Index] < 0 then value else Text.Start(value, found[Index]) & new & Text.Middle(value, found[End])
