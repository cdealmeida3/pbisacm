// A key set: a record with one field per distinct key, to test "is this key in there?" fast with Record.HasFields(set,
// key), instead of List.Contains against a long list, which reads the whole list for every key (and builds a lazy list
// again each time). Made once, then tested many times (ARCHITECTURE §12, the speed rules).
(keys as list) as record =>
    let distinct = List.Buffer(List.Distinct(keys)) in
    Record.FromList(List.Repeat({true}, List.Count(distinct)), distinct)
