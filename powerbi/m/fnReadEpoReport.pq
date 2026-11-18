// The EPO systems report, one row per system (src/core/sources/epo/epo-report.ts). The header forms and the meaning of the
// status words are the reference file epo-systems-report.json. A row without an EPO ID is left out. Status is the
// ServiceNow status of the status word ("" when the word is not known); StatusWord is the word as EPO writes it. The
// description is plain text: EPO writes HTML (fnPlainText).
(read as record) as table =>
    let
        config = ReferenceFiles[#"epo-systems-report"],
        columns = config[columns],
        specs = List.Transform(Record.FieldNames(columns), (name) => [column = name, any = Record.Field(columns, name)]),
        picked = fnPickColumns(read, specs)[Table],
        withId = Table.SelectRows(picked, each [epoId] <> ""),
        words = List.Transform(Record.FieldNames(config[statuses]), (word) => {fnNameKey(word, ""), Record.Field(config[statuses], word)}),
        statusOf = (word as text) as text => let found = List.Select(words, (pair) => pair{0} = fnNameKey(word, "")) in if List.IsEmpty(found) then "" else found{0}{1},
        withStatus = Table.AddColumn(withId, "Status", each statusOf([status]), type text),
        changed = Table.TransformColumns(withStatus, {{"changed", fnParseDate, type nullable date}, {"description", fnPlainText, type text}}),
        renamed = Table.RenameColumns(changed, {
            {"epoId", "EpoId"}, {"name", "Name"}, {"description", "Description"}, {"status", "StatusWord"}, {"department", "Department"},
            {"owner", "Owner"}, {"responsible1", "Responsible1"}, {"responsible2", "Responsible2"}, {"changed", "Changed"}})
    in
        Table.SelectColumns(renamed, {"EpoId", "Name", "Status", "StatusWord", "Department", "Owner", "Responsible1", "Responsible2", "Changed", "Description"})
