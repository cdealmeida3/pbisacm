// How often each text is in a list, as a record: the text as the field name, its count as the value (one pass of
// Table.Group, no list searched per item).
(values as list) as record =>
    let
        grouped = Table.Group(Table.FromColumns({values}, {"Value"}), {"Value"}, {{"Count", Table.RowCount, Int64.Type}})
    in
        Record.FromList(grouped[Count], grouped[Value])
