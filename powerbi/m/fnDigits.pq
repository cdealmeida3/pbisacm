// True when the text is one or more digits 0-9.
(text as text) as logical =>
    text <> "" and List.AllTrue(List.Transform(Text.ToList(text), (char) => Text.Contains("0123456789", char)))
