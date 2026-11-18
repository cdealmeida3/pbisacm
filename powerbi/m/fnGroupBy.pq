// The items of a list grouped by a key: a record key -> the items with that key, in the order of the list. The groups are
// in the order their first item comes. An empty list gives an empty record.
(items as list, keyOf as function) as record =>
    if List.IsEmpty(items) then []
    else
        let
            table = Table.FromColumns({List.Transform(items, keyOf), items}, {"Key", "Item"}),
            grouped = Table.Group(table, {"Key"}, {{"Items", (rows) => rows[Item], type list}})
        in
            Record.FromList(grouped[Items], grouped[Key])
