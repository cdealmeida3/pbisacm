// "1 Service Offering", "2 Service Offerings", "1,200 rows" (src/core/shared/text.ts, plural).
(count as number, word as text, optional many as nullable text) as text =>
    Number.ToText(count, "#,0", "en-GB") & " " & (if count = 1 then word else if many = null then word & "s" else many)
