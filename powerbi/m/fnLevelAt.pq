// A criticality value of a CI by its check-file name ("target.availability"); null when not set or not such a name.
(ci as record, field as text) as nullable number =>
    let column = Record.FieldOrDefault(LevelColumns, field, null) in
    if column = null then null else Record.FieldOrDefault(ci, column, null)
