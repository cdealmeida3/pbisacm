// The text with the first `old` replaced by `new` (String.replace of JavaScript with a text, not a pattern).
(text as text, old as text, new as text) as text =>
    let at = Text.PositionOf(text, old) in
    if old = "" or at < 0 then text else Text.Start(text, at) & new & Text.Middle(text, at + Text.Length(old))
