// Any cell as text, as the HTML app reads it: dates as yyyy-mm-dd hh:mm:ss, true/false, numbers without a thousands
// separator. An empty cell is "".
(value as any) as text =>
    if value = null then ""
    else if value is text then value
    else if value is datetime then DateTime.ToText(value, [Format = "yyyy-MM-dd HH:mm:ss", Culture = "en-US"])
    else if value is date then Date.ToText(value, [Format = "yyyy-MM-dd", Culture = "en-US"]) & " 00:00:00"
    else if value is logical then (if value then "true" else "false")
    else if value is number then Number.ToText(value, "G", "en-US")
    else Text.From(value, "en-US")
