// The text with its first character in upper case (as the details of a finding are shown).
(value as text) as text => Text.Upper(Text.Start(value, 1), "en-US") & Text.Middle(value, 1)
