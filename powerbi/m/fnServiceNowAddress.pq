// The ServiceNow address as typed, made safe (src/core/cases/record-search.ts, serviceNowAddress): "https://" and the host
// only, in lower case; "" when it is not such a link, so no link is built.
(typed as text) as text =>
    let
        text = Text.Trim(typed),
        lower = Text.Lower(text, "en-US"),
        rest = if Text.StartsWith(lower, "https://") then Text.Middle(text, 8) else "",
        host = Text.Lower(List.First(Text.SplitAny(rest, "/?#"), ""), "en-US"),
        name = Text.BeforeDelimiter(host, ":"),
        port = if Text.Contains(host, ":") then Text.AfterDelimiter(host, ":") else null,
        allowed = (value as text, chars as text) as logical => List.AllTrue(List.Transform(Text.ToList(value), (char) => Text.Contains(chars, char)))
    in
        if name = "" or not allowed(name, "abcdefghijklmnopqrstuvwxyz0123456789.-") or (port <> null and (port = "" or not allowed(port, "0123456789"))) then ""
        else "https://" & host
