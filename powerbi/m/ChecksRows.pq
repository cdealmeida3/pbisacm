// Table Checks: one row per check file that is not "off" (D141), from the check files packed by the generator
// (CheckFiles). The check files stay the one place where a check is described (D16).
let
    files = Json.Document(CheckFiles),
    topics = ReadingRules[topics],
    sections = ReadingRules[sections],
    topicOf = (folder as text) as record => let found = List.Select(topics, (topic) => topic[folder] = folder) in if List.IsEmpty(found) then topics{0} else found{0},
    sectionOrder = (id as text) as number => List.PositionOf(List.Transform(sections, (item) => item[id]), id) + 1,
    row = (position as number) as list =>
        let
            file = files{position},
            pack = file[pack],
            detector = pack[detector],
            playbook = Record.FieldOrDefault(pack, "playbook", []),
            topic = topicOf(file[folder]),
            sectionNo = sectionOrder(pack[dimension]),
            module = if detector[type] = "rule" then "rule" else Record.FieldOrDefault(detector, "module", detector[type]),
            // The kind of card page (src/app/view/cards.ts, cardKind; plan §6.1).
            kind = if List.Contains(Record.FieldOrDefault(playbook, "audience", {}), "procurement") then "mailbox"
                else if Record.FieldOrDefault(playbook, "path", "") = "mapping" then "mapping"
                else if Record.FieldOrDefault(pack, "reviewOnly", false) = true then "review"
                else if Record.FieldOrDefault(playbook, "path", "") = "sacm-fix" then "fix"
                else "owners"
        in
            {
                pack[id], pack[status], Record.FieldOrDefault(pack, "title", ""), Record.FieldOrDefault(pack, "cardLabel", ""), Record.FieldOrDefault(pack, "cardHint", ""), Record.FieldOrDefault(pack, "cardText", Record.FieldOrDefault(pack, "cardHint", "")),
                Record.FieldOrDefault(pack, "family", ""), pack[dimension], sections{sectionNo - 1}[label], sectionNo, Record.FieldOrDefault(pack, "severity", ""), topic[word],
                List.PositionOf(topics, topic) + 1, Record.FieldOrDefault(pack, "priority", "daily"), Record.FieldOrDefault(pack, "reviewOnly", false),
                detector[type], module, Record.FieldOrDefault(playbook, "path", ""),
                if Record.FieldOrDefault(pack, "subject", "") = "contract" then "contracts" else "CIs",
                position + 1, sectionNo * 1000 + position + 1, file[path], List.Contains(BuiltDetectors, module), kind
            },
    table = #table(
        type table [CheckId = text, Status = text, Title = text, CardLabel = text, CardHint = text, CardText = text,
            Family = text, Dimension = text, Section = text, SectionOrder = Int64.Type, Severity = text, Topic = text,
            TopicOrder = Int64.Type, Priority = text, ReviewOnly = logical, DetectorType = text, Module = text, Path = text,
            Counts = text, FileOrder = Int64.Type, SortKey = Int64.Type, FileName = text, Built = logical, Kind = text],
        List.Transform(List.Positions(files), row))
in
    Table.SelectRows(table, each [Status] <> "off")
