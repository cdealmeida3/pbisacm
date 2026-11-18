// Table Run (hidden, D284): the checks on the newest CI report, computed ONCE per refresh, as the rows of eleven parts.
// Power Query computes a shared query again for every table that reads it, so the tables that show a result of the
// checks do not read CheckRun: they are DAX calculated tables that split Run (Findings, Tested, Notes, Parked,
// MappingBacklog, RelationshipLinks, CapabilitySheet, SelfCheck, and from build B5 CaseLines, RepliesToRead and Exceptions, which add
// the journal of the team, D292). Part: the name of the part; every other column of a
// part is named <Part>.<Column> (Findings.Key), so no two parts share a column. ReportDate: the date of the run, on
// every row. Run is computed in full at every refresh, so the cases follow the journal; the history of every report
// date is the table HistoryRun (D290). A new result of the checks is a new part here, never a table that reads CheckRun
// (ARCHITECTURE §12, the speed rules).
let
    run = CheckRun,
    findings = Table.Buffer(fnFindingsPart(run)),
    tested = Table.Buffer(fnTestedPart(run)),
    cases = fnCases(run),
    parts = {
        {"Findings", findings}, {"Tested", tested}, {"Notes", fnNotesPart(run)}, {"Parked", fnParkedPart(run)},
        {"MappingBacklog", fnMappingBacklogPart(run)}, {"RelationshipLinks", fnRelationshipLinksPart(run)},
        {"CapabilitySheet", fnCapabilitySheetPart(run)}, {"SelfCheck", fnSelfCheckPart(findings, tested)},
        {"CaseLines", fnCaseLinesPart(cases)}, {"RepliesToRead", fnRepliesToReadPart(cases)}, {"Exceptions", fnExceptionsPart(run)}
    },
    // Each part with its columns named <Part>.<Column> and a column Part. The type of each column is the data type of the
    // calculated table that shows it (RunColumnTypes, generated), so Run and the calculated tables never differ.
    prefixed = List.Transform(parts, (part) =>
        let
            name = part{0},
            rows = part{1}
        in
            Table.AddColumn(Table.RenameColumns(rows, List.Transform(Table.ColumnNames(rows), (column) => {column, name & "." & column})), "Part", each name, type text)),
    combined = Table.Combine(prefixed),
    typed = Table.TransformColumnTypes(combined, RunColumnTypes),
    withDate = Table.AddColumn(typed, "ReportDate", each if run = null then null else run[Date], type nullable date)
in
    Table.ReorderColumns(withDate, {"Part", "ReportDate"} & List.Select(Table.ColumnNames(withDate), (column) => column <> "Part" and column <> "ReportDate"))
