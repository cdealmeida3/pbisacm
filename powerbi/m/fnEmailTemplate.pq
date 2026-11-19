// The email template (design pass §6, D313, D314; tools/powerbi/email.ts is its answer key): each draft of fnDrafts laid
// out as an email that reads the same in Outlook for Windows, Outlook on the web, Outlook on a phone and Gmail (tables and
// inline styles only): a navy band with the reference, "In this email", the numbered parts, clear tables, the box "What
// we ask" and a footer. It changes no word of fnDrafts: every text comes from the draft's Layout. The parts of a long
// message (split at MessageWords[maxCis] CIs, D36) are joined into one email; each table shows its first
// settings[RowsInEmail] lines, then "and N more in the attached file", and the email gets a CSV file with every line
// (UTF-8 with a BOM). A short email has no file. Below 480 px (a phone) a line of a table becomes a small card.
// `drafts`: fnDrafts; `settings`: MessageSettings. One record per draft, in the same order: Html, Csv, Summary (the lines
// of "In this email" as text), Subject (of the email) and First (the position of the draft whose email holds this
// draft). The first part of a message holds the whole email; its other parts hold "". The texts keep %%REF%% and
// %%SENDER%%, which the Power App fills when the manager sends (D301).
(drafts as list, settings as record) as list =>
    let
        style = EmailStyle,
        C = style[colours],
        F = "font-family:" & style[font],
        columnWords = MessageWords[columns],
        rowsInEmail = settings[RowsInEmail],
        all = List.Buffer(drafts),
        ref = "%%REF%%",
        plural = (count as number, word as text) as text => Text.From(count) & " " & word & (if count = 1 then "" else "s"),
        // A draft joins the email of the draft before it when both are parts of one message.
        joins = (at as number) as logical =>
            at > 0 and
                (let draft = all{at}, before = all{at - 1} in
                draft[PartCount] > 1 and before[PartCount] = draft[PartCount] and draft[PartIndex] = before[PartIndex] + 1
                    and before[Kind] = draft[Kind] and Text.Lower(before[To], "en-US") = Text.Lower(draft[To], "en-US")),
        starts = List.Buffer(List.Select(List.Positions(all), (at) => not joins(at))),
        groups = List.Buffer(List.Transform(List.Positions(starts), (n) =>
            let from = starts{n}, until = if n + 1 < List.Count(starts) then starts{n + 1} else List.Count(all) in List.Numbers(from, until - from))),

        /* ---------------------------------------------------------- the parts of one email */
        // Two parts with the same half of a reminder and the same key are one, their lines joined.
        joinedSections = (members as list) as list =>
            let
                flat = List.Buffer(List.Combine(List.Transform(members, (draft) => draft[Layout][Sections]))),
                idOf = (piece as record) as text => piece[Group] & "|" & piece[Key],
                ids = List.Distinct(List.Transform(flat, idOf))
            in
                List.Buffer(List.Transform(ids, (id) =>
                    let same = List.Buffer(List.Select(flat, (piece) => idOf(piece) = id)) in
                    same{0} & [Rows = List.Combine(List.Transform(same, (piece) => piece[Rows])), Found = List.AnyTrue(List.Transform(same, (piece) => piece[Found]))])),
        cisOf = (members as list) as number => List.Count(List.Distinct(List.Combine(List.Transform(members, (draft) => draft[Layout][Cis])))),
        // The subject of an email of several parts, as fnDrafts writes a subject, for all its CIs.
        joinedSubject = (members as list, sections as list) as text =>
            let
                first = members{0},
                layout = first[Layout],
                ciCount = cisOf(members),
                kinds = List.Count(List.Distinct(List.Transform(sections, (piece) => piece[Key]))),
                onWhat = if ciCount = 1 then layout[FirstName] else plural(ciCount, layout[Noun]),
                topic = if kinds = 1 then sections{0}[Title] & " on " & onWhat
                    else if layout[Noun] = "contract" then plural(ciCount, "contract") & (if ciCount = 1 then " needs" else " need") & " a correction in Solusi"
                    else plural(ciCount, "CI") & (if ciCount = 1 then " needs" else " need") & " your attention in the CMDB",
                full = if first[Kind] = "reminder" then "Reminder: " & topic
                    else if first[Kind] = "escalation" then "No answer on " & plural(ciCount, layout[Noun]) & " of " & first[About]
                    else topic
            in
                full & " [" & ref & "]",

        /* ---------------------------------------------------------- the attached file */
        csvCell = (value as text) as text =>
            let
                safe = if List.Contains({"=", "+", "-", "@", "#(tab)", "#(cr)"}, Text.Start(value, 1)) then "'" & value else value
            in
                if Text.Contains(safe, ",") or Text.Contains(safe, """") or Text.Contains(safe, "#(cr)") or Text.Contains(safe, "#(lf)")
                    or Text.StartsWith(safe, " ") or Text.EndsWith(safe, " ")
                then """" & Text.Replace(safe, """", """""") & """" else safe,
        csvOf = (sections as list) as text =>
            let
                contracts = List.AllTrue(List.Transform(sections, (piece) => piece[Contract])),
                head = if contracts then {"Part", "Contract number", "Name", "Vendor", "What we found"} else {"Part"} & columnWords & {"What we found"},
                lines = List.Combine(List.Transform(sections, (piece) => List.Transform(piece[Rows], (cells) =>
                    if contracts or not piece[Contract] then {piece[Title]} & cells
                    // A contract in an email about CIs too: its number and name as the name, "Contract" as the class.
                    else {piece[Title], Text.Combine(List.Select({cells{0}, cells{1}}, (value) => value <> ""), " · "), "", "Contract", "", "", "", "", cells{3}})))
            in
                "#(feff)" & Text.Combine(List.Transform({head} & lines, (line) => Text.Combine(List.Transform(line, csvCell), ",")), "#(cr,lf)") & "#(cr,lf)",

        /* ---------------------------------------------------------- the HTML */
        row = (rowStyle as text, content as text, fill as text) as text =>
            "<tr><td" & (if fill <> "" then " bgcolor=""" & fill & """" else "") & " style=""" & rowStyle & """>" & content & "</td></tr>",
        text14 = F & ";font-size:14px;line-height:21px;color:" & C[ink],
        cellStyle = "padding:7px 10px;border-bottom:1px solid " & C[line] & ";color:" & C[ink],
        dash = "<span style=""color:" & C[muted] & """>–</span>",
        // The columns with one value on every line, above the table.
        commonLine = (pairs as list) as text =>
            if List.IsEmpty(pairs) then ""
            else "<p style=""margin:0 0 6px;" & F & ";font-size:13px;color:" & C[muted] & """>"
                & Text.Combine(List.Transform(pairs, (pair) => pair{0} & ": <b style=""color:" & C[ink] & ";font-weight:600"">" & fnHtml(pair{1}) & "</b>"), " &nbsp;·&nbsp; ") & "</p>",
        // The table of a part: the first rowsInEmail lines, then how many more are in the file.
        tableOf = (piece as record) as text =>
            let
                rows = List.Buffer(piece[Rows]),
                column = (at as number) as list => List.Transform(rows, (cells) => cells{at}),
                same = (at as number) as logical => List.Count(List.Distinct(column(at))) = 1,
                empty = (at as number) as logical => List.AllTrue(List.Transform(column(at), (value) => value = "")),
                // The role of the person asked is always them; an empty column says nothing; one value on every line goes above the table.
                roles = List.Buffer(List.Transform({3, 4, 5, 6}, (at) =>
                    let label = columnWords{at} in
                    if (label = piece[Role] and same(at)) or empty(at) then null
                    else if same(at) then [Common = {label, rows{0}{at}}]
                    else [Column = [At = at, Label = label, Wide = false, Name = false]])),
                columns = List.Buffer(
                    if piece[Contract] then
                        List.Transform({0, 1, 2}, (at) => [At = at, Label = {"Contract number", "Name", "Vendor"}{at}, Wide = false, Name = false])
                        & {[At = 3, Label = "What we found", Wide = true, Name = false]}
                    else
                        {[At = 0, Label = columnWords{0}, Wide = false, Name = true]}
                        & (if empty(1) then {} else {[At = 1, Label = columnWords{1}, Wide = false, Name = false]})
                        & List.Transform(List.Select(roles, (entry) => entry <> null and Record.HasFields(entry, "Column")), (entry) => entry[Column])
                        & (if piece[Found] then {[At = 7, Label = "What we found", Wide = true, Name = false]} else {})),
                common = if piece[Contract] then {} else List.Transform(List.Select(roles, (entry) => entry <> null and Record.HasFields(entry, "Common")), (entry) => entry[Common]),
                shown = List.Buffer(List.FirstN(rows, rowsInEmail)),
                more = List.Count(rows) - List.Count(shown),
                th = (label as text) as text =>
                    "<th align=""left"" bgcolor=""" & C[head] & """ style=""padding:7px 10px;color:" & C[navy] & ";font-weight:600;border-bottom:1px solid " & C[line] & """>" & label & "</th>",
                td = (cells as list, col as record, first as logical) as text =>
                    let
                        value = cells{col[At]},
                        content =
                            if col[Name] then
                                "<span style=""font-weight:600;color:" & C[ink] & """>" & (if value = "" then "–" else fnHtml(value)) & "</span>"
                                    & (if cells{2} <> "" then "<br><span style=""color:" & C[muted] & ";font-size:12px"">" & fnHtml(cells{2}) & "</span>" else "")
                            else if value = "" then dash
                            else fnHtml(value)
                    in
                        "<td valign=""top""" & (if col[Wide] then " width=""45%""" else "") & " style=""" & cellStyle & """"
                            & (if first then "" else " data-l=""" & col[Label] & """") & ">" & content & "</td>",
                body = Text.Combine(List.Transform(List.Positions(shown), (at) =>
                    "<tr bgcolor=""" & (if Number.Mod(at, 2) = 0 then C[surface] else C[zebra]) & """>"
                        & Text.Combine(List.Transform(List.Positions(columns), (n) => td(shown{at}, columns{n}, n = 0))) & "</tr>")),
                rest = if more > 0 then "<tr><td colspan=""" & Text.From(List.Count(columns)) & """ style=""padding:8px 10px;color:" & C[muted]
                    & ";font-style:italic;font-size:13px"">and " & Text.From(more) & " more in the attached file</td></tr>" else ""
            in
                commonLine(common) & "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" class=""t"" style=""border-collapse:collapse;" & F
                    & ";font-size:13px;border:1px solid " & C[line] & """><tr class=""h"">" & Text.Combine(List.Transform(columns, (col) => th(col[Label]))) & "</tr>" & body & rest & "</table>",
        // One part: its number and heading, the text, the table, what we ask and why it matters.
        sectionHtml = (piece as record, index as number, numbered as logical) as text =>
            let
                heading =
                    if numbered then
                        "<table cellpadding=""0"" cellspacing=""0"" border=""0""><tr><td valign=""top"" width=""26""><table cellpadding=""0"" cellspacing=""0"" border=""0""><tr>"
                            & "<td bgcolor=""" & C[navy] & """ width=""26"" height=""26"" align=""center"" style=""" & F & ";color:" & C[onNavy]
                            & ";font-size:13px;font-weight:600;border-radius:13px"">" & Text.From(index) & "</td></tr></table></td>"
                            & "<td style=""padding:2px 0 0 10px;" & F & ";font-size:16px;line-height:22px;font-weight:600;color:" & C[ink] & """>" & piece[Heading] & "</td></tr></table>"
                    else "<div style=""" & F & ";font-size:16px;font-weight:600;color:" & C[ink] & """>" & piece[Heading] & "</div>"
            in
                row("padding:22px 28px 4px", heading, "")
                    & (if piece[Lead] <> "" then row("padding:4px 28px;" & text14, piece[Lead], "") else "")
                    & row("padding:6px 28px", tableOf(piece), "")
                    & (if piece[Ask] <> "" then row("padding:10px 28px 2px", "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0""><tr><td width=""4"" bgcolor=""" & C[navy] & """></td>"
                        & "<td bgcolor=""" & C[ask] & """ style=""padding:10px 14px;" & text14 & """><b style=""color:" & C[navy] & """>What we ask</b><br>" & piece[Ask] & "</td></tr></table>", "") else "")
                    & (if piece[Why] <> "" then row("padding:6px 28px 0;" & F & ";font-size:13px;line-height:19px;color:" & C[muted], "<b>Why it matters:</b> " & piece[Why], "") else ""),
        // "In this email": the numbered parts and their lines, under the half of a reminder they are in.
        contents = (sections as list) as text =>
            let
                cell = "padding:3px 0;" & F & ";font-size:13px",
                lines = Text.Combine(List.Transform(List.Positions(sections), (at) =>
                    let
                        piece = sections{at},
                        before = if at = 0 then "" else sections{at - 1}[Group],
                        head = if piece[Group] <> before then "<tr><td colspan=""2"" style=""padding:" & (if at = 0 then "4" else "8") & "px 0 2px;" & F
                            & ";font-size:12px;font-weight:600;color:" & C[navy] & """>" & fnHtml(piece[Group]) & "</td></tr>" else ""
                    in
                        head & "<tr><td style=""" & cell & ";color:" & C[ink] & """>" & Text.From(at + 1) & ".&nbsp; " & piece[Heading] & "</td><td align=""right"" style="""
                            & cell & ";color:" & C[muted] & ";white-space:nowrap"">" & plural(List.Count(piece[Rows]), "line") & "</td></tr>"))
            in
                row("padding:14px 28px 4px", "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" bgcolor=""" & C[box] & """ style=""border:1px solid " & C[line]
                    & """><tr><td style=""padding:12px 16px""><div style=""" & F & ";font-size:12px;color:" & C[muted] & ";font-weight:600"">In this email</div>"
                    & "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">" & lines & "</table></td></tr></table>", ""),
        // The line at the foot of the email: why they get it.
        footerOf = (draft as record) as text =>
            if draft[Kind] = "escalation" then "You get this email because the person ServiceNow names for these records did not answer us. SACM changes ServiceNow only with an answer."
            else if draft[Mailbox] then "You get this email because Procurement owns the contract data in Solusi. ServiceNow receives your corrections with the next upload."
            else if draft[Team] then "You get this email because your team is responsible for the record of these CIs. SACM changes ServiceNow only with your answer."
            else "You get this email because ServiceNow names you for these records. SACM changes ServiceNow only with your answer.",

        /* ---------------------------------------------------------- one email */
        emailOf = (members as list) as record =>
            let
                first = members{0},
                layout = first[Layout],
                sections = joinedSections(members),
                kinds = List.Count(List.Distinct(List.Transform(sections, (piece) => piece[Key]))),
                numbered = List.Count(sections) > 1,
                opening = List.Buffer(layout[Opening] & (if layout[Why] <> "" then {if kinds > 1 then layout[Why] & " We found " & plural(kinds, "kind") & " of problem." else layout[Why]} else {})),
                long = List.AnyTrue(List.Transform(sections, (piece) => List.Count(piece[Rows]) > rowsInEmail)),
                csv = if long then csvOf(sections) else "",
                subject = if List.Count(members) = 1 and first[PartCount] = 1 then first[Subject] else joinedSubject(members, sections),
                summary = Text.Combine(List.Transform(List.Positions(sections), (at) =>
                    (if numbered then Text.From(at + 1) & ". " else "") & sections{at}[Title] & " · " & plural(List.Count(sections{at}[Rows]), "line")), "#(lf)"),
                parts = Text.Combine(List.Transform(List.Positions(sections), (at) =>
                    let
                        piece = sections{at},
                        before = if at = 0 then "" else sections{at - 1}[Group],
                        head = if piece[Group] <> before then row("padding:26px 28px 0", "<div style=""" & F & ";font-size:13px;font-weight:600;color:" & C[navy]
                            & ";padding-bottom:6px;border-bottom:1px solid " & C[line] & """>" & fnHtml(piece[Group]) & "</div>", "") else ""
                    in
                        head & sectionHtml(piece, at + 1, numbered))),
                sender = Text.Trim(layout[Sender]),
                preview = if List.Count(opening) > 1 then opening{1} else "",
                html = "<!DOCTYPE html><html lang=""en""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width, initial-scale=1"">"
                    & "<style>" & style[phone] & "</style></head><body style=""margin:0;padding:0;background:" & C[page] & """>"
                    & (if preview <> "" then "<div style=""display:none;max-height:0;overflow:hidden;mso-hide:all"">" & preview & "</div>" else "")
                    & "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" bgcolor=""" & C[page] & """><tr><td align=""center"" style=""padding:16px 8px"">"
                    & "<table width=""720"" cellpadding=""0"" cellspacing=""0"" border=""0"" bgcolor=""" & C[surface] & """ style=""max-width:720px;width:100%;border:1px solid " & C[line] & """>"
                    & row("padding:14px 28px", "<table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0""><tr><td style=""" & F & ";font-size:15px;font-weight:600;color:" & C[onNavy]
                        & """>SACM · CMDB data quality</td><td align=""right"" style=""" & F & ";font-size:12px;color:" & C[navyMuted] & """>Ref. " & ref & "</td></tr></table>", C[navy])
                    & "<tr><td height=""3"" bgcolor=""" & C[deco] & """ style=""font-size:0;line-height:0"">&nbsp;</td></tr>"
                    & row("padding:22px 28px 0;" & text14, Text.Combine(List.Transform(List.Positions(opening), (at) =>
                        "<p style=""margin:" & (if at = List.Count(opening) - 1 then "0" else "0 0 10px") & """>" & opening{at} & "</p>")), "")
                    & (if numbered then contents(sections) else "")
                    & parts
                    & row("padding:22px 28px 6px;" & text14, (if csv <> "" then "<b>Attached:</b> " & ref & ".csv, all " & plural(cisOf(members), layout[Noun]) & " and what we found, to open in Excel.<br><br>" else "")
                        & "When you reply, please keep the reference <b>[" & ref & "]</b> in the subject.", "")
                    & row("padding:10px 28px 24px;" & text14, "Thank you,<br>" & (if sender <> "" then "<b>" & fnHtml(sender) & "</b><br>" else "") & fnHtml(layout[Signature]), "")
                    & row("padding:12px 28px;" & F & ";font-size:12px;line-height:17px;color:" & C[muted] & ";border-top:1px solid " & C[line], footerOf(first), C[box])
                    & "</table></td></tr></table></body></html>"
            in
                [Html = html, Csv = csv, Summary = summary, Subject = subject],
        emails = List.Buffer(List.Transform(groups, (positions) => emailOf(List.Buffer(List.Transform(positions, (at) => all{at}))))),
        // For each draft: its email (the first part) or nothing (the other parts), and where its email is.
        groupOf = List.Buffer(List.Combine(List.Transform(List.Positions(groups), (n) => List.Repeat({n}, List.Count(groups{n})))))
    in
        List.Transform(List.Positions(all), (at) =>
            let n = groupOf{at}, start = starts{n} in
            if at = start then emails{n} & [First = start] else [Html = "", Csv = "", Summary = "", Subject = "", First = start])
