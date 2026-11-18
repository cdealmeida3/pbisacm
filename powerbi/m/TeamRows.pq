// Table Team (D291): the SACM managers of the list SACM Team. Me: the manager who opens the report, by the email of their
// sign-in (the measure Me); in Sample mode the first active manager, so My work shows something.
let
    rows = Table.ToRecords(fnStateList("team")),
    lines = List.Transform(rows, (row) => {row[Title], Text.Lower(Text.Trim(row[Email]), "en-US"), not List.Contains({"no", "false", "0"}, Text.Lower(Text.Trim(row[Active]), "en-US"))}),
    firstActive = List.First(List.Select(lines, (item) => item{2}), null),
    marked = List.Transform(lines, (item) => item & {StateMode = "Sample" and firstActive <> null and item{1} = firstActive{1}})
in
    #table(type table [Name = text, Email = text, Active = logical, SampleMe = logical], marked)
