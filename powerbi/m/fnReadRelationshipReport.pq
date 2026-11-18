// The Relationship report, one row per relationship (src/core/sources/relationships/relationship-report.ts). The first
// Class and Asset tag columns are the parent's, the second the child's; the field-name forms win when they are there.
// Excluded is null when the report has no "Excluded for calculation" column. A row without a parent or a child is left out.
(read as record) as table =>
    let
        rules = ReadingRules[relationshipColumns],
        headers = read[Headers],
        first = (names as list) as number => fnColumnIndex(headers, names),
        all = (name as text) as list => List.Select(List.Positions(headers), (position) => headers{position} = name),
        classes = all("class") & all("sys_class_name"),
        tags = all("asset_tag"),
        byPosition = (explicit as number, list as list, at as number) as number =>
            if explicit >= 0 then explicit else if List.Count(list) = 2 then list{at} else -1,
        isExcluded = (header as text) as logical =>
            List.AnyTrue(List.Transform({"excluded_for_calculation", "excluded_from_calculation"}, (end) =>
                Text.EndsWith(header, end) and (
                    let prefix = Text.Start(header, Text.Length(header) - Text.Length(end)) in
                    prefix = "" or (Text.EndsWith(prefix, "_") and Text.Length(prefix) > 1
                        and List.AllTrue(List.Transform(Text.ToList(Text.Start(prefix, Text.Length(prefix) - 1)), (char) => Text.Contains("abcdefghijklmnopqrstuvwxyz0123456789", char))))))),
        positions = [
            Parent = first(rules[parent]),
            Type = first(rules[type]),
            Child = first(rules[child]),
            ParentClass = byPosition(first(rules[parentClass]), classes, 0),
            ChildClass = byPosition(first(rules[childClass]), classes, 1),
            ParentTag = byPosition(first(rules[parentTag]), tags, 0),
            ChildTag = byPosition(first(rules[childTag]), tags, 1),
            Excluded = List.PositionOf(List.Transform(headers, isExcluded), true)
        ],
        cell = (row as list, position as number) as text => if position < 0 or position >= List.Count(row) then "" else Text.Trim(row{position}),
        rows = List.Transform(Table.ToRows(read[Rows]), (row) => {
            cell(row, positions[Parent]), cell(row, positions[Type]), cell(row, positions[Child]),
            fnCanonicalClass(cell(row, positions[ParentClass])), fnCanonicalClass(cell(row, positions[ChildClass])),
            cell(row, positions[ParentTag]), cell(row, positions[ChildTag]),
            if positions[Excluded] < 0 then null else List.Contains({"true", "yes", "1", "y"}, Text.Lower(cell(row, positions[Excluded]), "en-US"))
        }),
        table = #table(
            type table [Parent = text, Type = text, Child = text, ParentClass = text, ChildClass = text, ParentTag = text, ChildTag = text, Excluded = nullable logical],
            rows)
    in
        Table.SelectRows(table, each [Parent] <> "" and [Child] <> "")
