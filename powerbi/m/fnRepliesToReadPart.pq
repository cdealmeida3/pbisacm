// The part RepliesToRead of the table Run (D292), which the DAX table RepliesToRead shows (My day, My work): one line per
// reply that waits to be read, newest first (src/app/view/cases.ts, repliesToRead). A reply is read once a manager
// acted on one of its cases after it arrived (a status, a decision to stop following, a message); a case that is closed
// (Verified, Not followed up) lists none. FirstLine: the first line of the reply that is not a greeting ("Hi Ana,").
// AssignedTo: who has its cases, for "mine first". Daily: one of its cases is on a daily card (My day counts only those,
// D182). `cases` is fnCases(CheckRun).
(cases as list) as table =>
    let
        later = fnKeySet(Table.SelectRows(ChecksRows, each [Priority] = "later")[CheckId]),
        open = List.Select(cases, (item) => not item[Closed] and not List.IsEmpty(item[Replies])),
        pairs = List.Combine(List.Transform(open, (item) => List.Transform(item[Replies], (reply) =>
            [File = reply[Ref] & "|" & reply[Received], Reply = reply, Case = item, Read = Text.Start(reply[Received], 19) <= item[Acted]]))),
        handled = fnKeySet(List.Transform(List.Select(pairs, (pair) => pair[Read]), (pair) => pair[File])),
        waiting = List.Select(pairs, (pair) => not pair[Read] and not Record.HasFields(handled, pair[File])),
        byFile = fnGroupBy(waiting, (pair) => pair[File]),
        greeting = (line as text) as logical =>
            let
                lower = Text.Lower(line, "en-US"),
                word = List.First(List.Select({"hello", "dear", "hi"}, (item) => Text.StartsWith(lower, item)
                    and (Text.Length(lower) = Text.Length(item) or not List.Contains({"a".."z", "0".."9", "_"}, Text.At(lower, Text.Length(item))))), null),
                rest = if word = null then "" else Text.Middle(lower, Text.Length(word)),
                core = if Text.EndsWith(rest, "!") or Text.EndsWith(rest, ",") then Text.Start(rest, Text.Length(rest) - 1) else rest
            in
                word <> null and Text.Length(core) <= 40 and Text.Remove(core, {".", "?", "!"}) = core,
        firstLine = (body as text) as text =>
            let
                lines = List.Select(List.Transform(Text.SplitAny(body, "#(cr)#(lf)"), Text.Trim), (line) => line <> ""),
                kept = List.Select(lines, (line) => not greeting(line))
            in
                List.First(kept, List.First(lines, "")),
        lines = List.Transform(Record.FieldNames(byFile), (file) =>
            let
                group = Record.Field(byFile, file),
                reply = group{0}[Reply],
                own = List.Transform(group, (pair) => pair[Case])
            in
                {
                    file, reply[Ref], reply[From], DateTime.FromText(Text.Start(reply[Received], 19), [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"]), firstLine(reply[Body]),
                    List.Count(own), List.Count(List.Distinct(List.Transform(own, (item) => item[CiKey]))),
                    Text.Combine(List.Distinct(List.Select(List.Transform(own, (item) => item[AssignedTo]), (name) => name <> "")), ", "),
                    Text.Combine(List.Distinct(List.Transform(own, (item) => item[CheckId])), ", "),
                    List.AnyTrue(List.Transform(own, (item) => not Record.HasFields(later, item[CheckId])))
                })
    in
        Table.Sort(
            #table(type table [File = text, Ref = text, From = text, Received = datetime, FirstLine = text, Cases = Int64.Type, CIs = Int64.Type, AssignedTo = text, Checks = text, Daily = logical], lines),
            {{"Received", Order.Descending}, {"File", Order.Ascending}})
