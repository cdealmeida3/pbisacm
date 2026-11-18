// The text of a report file: UTF-8, else Windows-1252 (as ServiceNow CSV exports can be). A byte order mark is removed.
(content as binary) as text =>
    let
        utf8 = Text.FromBinary(content, TextEncoding.Utf8),
        text = if Text.Contains(utf8, Character.FromNumber(65533)) then Text.FromBinary(content, 1252) else utf8
    in
        if Text.StartsWith(text, Character.FromNumber(65279)) then Text.Middle(text, 1) else text
