// A text of a check's message with its placeholders filled (src/core/messages/messages.ts, fill; build B7, D300), in two
// forms: Html for the mailbox, Text for Outlook and Teams. `fields`: the fields of the findings of the part (their roles
// fill {role}, {who}, {epoRole} and the requests of {request}); `texts`: the message texts of the check; `settings`:
// MessageSettings, with Channel "email" or "chat" ({reply} reads "reply to this email" or "answer in this chat", D163).
// The placeholders: {role}, {who}, {epoRole}, {request} (the request of the texts, or of each role when it is "role"),
// {request:<id>}, {form:<id>} (the request without the action inside its form), {reply} and {Reply}. Any other text in
// braces stays as it is.
(template as text, fields as list, texts as record, settings as record) as record =>
    let
        words = MessageWords,
        roles = List.Select(fields, (field) => Record.HasFields(words[roleLabel], field)),
        plain = (value as text) as record => [Html = fnHtml(value), Text = value],
        join = (parts as list, separator as text) as record => [
            Html = Text.Combine(List.Select(List.Transform(parts, (part) => part[Html]), (value) => value <> ""), separator),
            Text = Text.Combine(List.Select(List.Transform(parts, (part) => part[Text]), (value) => value <> ""), separator)
        ],
        orList = (items as list) as text =>
            if List.Count(items) <= 1 then List.First(items, "") else Text.Combine(List.RemoveLastN(items, 1), ", ") & " or " & List.Last(items),
        https = (value as text) as text => let trimmed = Text.Trim(value) in if Text.StartsWith(Text.Lower(trimmed, "en-US"), "https://") then trimmed else "",
        // A request with its link (requestRef). Head: the same words without " in the Service Portal" at the end (requestRefs).
        requestRef = (id as text, withAction as logical) as record =>
            let
                known = List.First(List.Select(words[requests], (request) => request[id] = id), null),
                set = Record.FieldOrDefault(settings[Requests], id, [Name = "", Link = ""]),
                saved = Text.Trim(set[Name]),
                name = if known = null then (if saved <> "" then saved else id)
                    else if saved = "" or saved = Record.FieldOrDefault(known, "was", null) then known[name] else saved,
                action = if known <> null and Record.FieldOrDefault(known, "action", "") <> "" and withAction then ", action """ & known[action] & """" else "",
                link = https(set[Link]),
                portal = https(settings[PortalLink]),
                where = if action <> "" then ", in the" else " in the",
                comma = if action <> "" then "," else "",
                headText = """" & name & """" & action & comma
            in
                if link <> "" then [Html = """<a href=""" & fnHtml(link) & """>" & fnHtml(name) & "</a>""" & fnHtml(action), Text = """" & name & """" & action & " (" & link & ")", Tail = false, Head = null]
                else if portal <> "" then [
                    Html = """" & fnHtml(name) & """" & fnHtml(action) & where & " <a href=""" & fnHtml(portal) & """>Service Portal</a>",
                    Text = """" & name & """" & action & where & " Service Portal (" & portal & ")", Tail = true,
                    Head = [Html = """" & fnHtml(name) & """" & fnHtml(action) & comma, Text = headText]]
                else [Html = fnHtml("""" & name & """" & action & where & " Service Portal"), Text = """" & name & """" & action & where & " Service Portal", Tail = true,
                    Head = [Html = fnHtml(headText), Text = headText]],
        // Several requests: "A" or "B" in the Service Portal, with "in the Service Portal" once, at the end.
        requestRefs = (ids as list) as record =>
            let
                refs = List.Buffer(List.Transform(ids, (id) => requestRef(id, true))),
                last = List.Count(refs) - 1,
                trimmed = List.Transform(List.Positions(refs), (at) => let ref = refs{at} in if at < last and ref[Tail] and refs{last}[Tail] then ref[Head] else ref)
            in
                [Html = Text.Combine(List.Transform(trimmed, (ref) => ref[Html]), " or "), Text = Text.Combine(List.Transform(trimmed, (ref) => ref[Text]), " or ")],
        isName = (value as text) as logical => value <> "" and Text.Remove(value, {"a".."z", "A".."Z"}) = "",
        isArgument = (value as text) as logical => value <> "" and Text.Remove(value, {"a".."z", "-"}) = "",
        // One placeholder: "{name}" or "{name:arg}" (the braces included), else null.
        token = (piece as text) as nullable record =>
            let
                inner = Text.Middle(piece, 1, Text.Length(piece) - 2),
                colon = Text.PositionOf(inner, ":"),
                name = if colon < 0 then inner else Text.Start(inner, colon),
                arg = if colon < 0 then null else Text.Middle(inner, colon + 1)
            in
                if isName(name) and (arg = null or isArgument(arg)) then [Name = name, Arg = arg] else null,
        filled = (found as record, piece as text) as record =>
            let name = found[Name], arg = found[Arg] in
            if name = "role" then plain(orList(List.Transform(roles, (field) => Record.Field(words[roleLabel], field))))
            else if name = "who" then plain(let who = orList(List.Transform(roles, (field) => Record.Field(words[roleWord], field))) in if who = "" then "person" else who)
            else if name = "epoRole" then plain(orList(List.Transform(roles, (field) => Record.FieldOrDefault(words[epoRole], field, Record.Field(words[roleLabel], field)))))
            else if name = "request" then
                let
                    request = Record.FieldOrDefault(texts, "request", ""),
                    ids = if arg <> null then {arg}
                        else if request = "role" then List.Select(List.Transform(roles, (field) => Record.FieldOrDefault(words[roleRequest], field, "")), (id) => id <> "")
                        else if request <> "" then {request} else {}
                in
                    requestRefs(ids)
            else if name = "form" and arg <> null then requestRef(arg, false)
            else if name = "reply" or name = "Reply" then
                let reply = if settings[Channel] = "chat" then "answer in this chat" else "reply to this email" in
                plain(if name = "Reply" then Text.Upper(Text.Start(reply, 1), "en-US") & Text.Middle(reply, 1) else reply)
            else plain(piece),
        // The pieces of the template: the text between the placeholders and each placeholder, in order.
        chunks = Text.Split(template, "{"),
        pieces = List.Combine(List.Transform(List.Positions(chunks), (at) =>
            let chunk = chunks{at}, close = Text.PositionOf(chunk, "}") in
            if at = 0 then {[Literal = chunk]}
            else if close < 0 then {[Literal = "{" & chunk]}
            else
                let piece = "{" & Text.Start(chunk, close + 1), found = token(piece), rest = Text.Middle(chunk, close + 1) in
                (if found = null then {[Literal = piece]} else {[Token = found, Piece = piece]}) & {[Literal = rest]})),
        out = List.Transform(List.Select(pieces, (piece) => not Record.HasFields(piece, "Literal") or piece[Literal] <> ""),
            (piece) => if Record.HasFields(piece, "Literal") then plain(piece[Literal]) else filled(piece[Token], piece[Piece]))
    in
        join(out, "")
