// A text as its letters and digits only, lower case (src/core/sources/epo/epo-report.ts, lettersOf): EPO keeps
// formatting, ServiceNow plain text, so only the words are compared. M knows no Unicode classes: a letter is a character
// with an upper and a lower case, a digit is 0 to 9 (letters without case, such as Chinese, are left out).
(text as text) as text =>
    let
        lower = Text.Lower(text, "en-US")
    in
        Text.Combine(List.Select(Text.ToList(lower), (char) =>
            let code = Character.ToNumber(char) in (code >= 48 and code <= 57) or Text.Upper(char, "en-US") <> char))
