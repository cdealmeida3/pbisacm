// A person of EPO in words: "Jane Doe (jdo)", the user ID alone when ServiceNow does not know it, or "nobody"
// (src/core/sources/epo/epo-report.ts, personWords).
(userId as text, names as record) as text =>
    let
        id = Text.Lower(Text.Trim(userId), "en-US"),
        name = Record.FieldOrDefault(names, id, null)
    in
        if userId = "" then "nobody" else if name <> null then name & " (" & id & ")" else id
