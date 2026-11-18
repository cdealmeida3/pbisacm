// The items of a list grouped by a key: a record key -> the items with that key, in the order of the list. The groups are
// in the order their first item comes. An empty list gives an empty record.
(items as list, keyOf as function) as record =>
    if List.IsEmpty(items) then []
    else
        let
            // Both columns buffered: a table made of lazy lists is computed again each time it is read (the speed build).
            buffered = List.Buffer(items),
            table = Table.FromColumns({List.Buffer(List.Transform(buffered, keyOf)), buffered}, {"Key", "Item"}),
            grouped = Table.Group(table, {"Key"}, {{"Items", (rows) => rows[Item], type list}})
        in
            Record.FromList(grouped[Items], grouped[Key])
