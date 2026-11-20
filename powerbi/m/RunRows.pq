// Table Run (hidden, D284): the checks on the newest CI report, computed ONCE per refresh, as the rows of fifteen parts.
// Power Query computes a shared query again for every table that reads it, so the tables that show a result of the
// checks do not read CheckRun: they are DAX calculated tables that split Run (Findings, Tested, Notes, Parked,
// MappingBacklog, RelationshipLinks, CapabilitySheet, SelfCheck, and from build B5 CaseLines, RepliesToRead and Exceptions, which add
// the journal of the team, D292; from build B7 Drafts, the messages ready to send, D300; from build R3 PeopleCheck and DataColumns, for the page Data check). Part: the name of the part; every other column of a
// part is named <Part>.<Column> (Findings.Key), so no two parts share a column. ReportDate: the date of the run, on
// every row. Run is computed in full at every refresh, so the cases follow the journal; the history of every report
// date is the table HistoryRun (D290). A new result of the checks is a new part here, never a table that reads CheckRun
// (ARCHITECTURE §12, the speed rules).
// From build B8 the run also holds the lines of the lifecycle review (fnWithReviews, the journal's marks, D306), and the
// part ReviewLines the reviews and the sample of the next one. The Self-check compares the checks of the reports alone
// (the HTML app's recorded result has no journal), so it leaves the lines of the review out.
let
    run = fnWithReviews(CheckRun),
    findings = Table.Buffer(fnFindingsPart(run)),
    tested = Table.Buffer(fnTestedPart(run)),
    cases = fnCases(run),
    review = "LIFECYCLE-REVIEW",
    parts = {
        {"Findings", findings}, {"Tested", tested}, {"Notes", fnNotesPart(run)}, {"Parked", fnParkedPart(run)},
        {"MappingBacklog", fnMappingBacklogPart(run, cases)}, {"RelationshipLinks", fnRelationshipLinksPart(run)},
        {"CapabilitySheet", fnCapabilitySheetPart(run)},
        {"SelfCheck", fnSelfCheckPart(Table.SelectRows(findings, each [CheckId] <> review), Table.SelectRows(tested, each [CheckId] <> review))},
        {"CaseLines", fnCaseLinesPart(cases)}, {"RepliesToRead", fnRepliesToReadPart(cases)}, {"Exceptions", fnExceptionsPart(run)},
        {"Drafts", fnDraftsPart(cases)}, {"ReviewLines", fnReviewLinesPart(run, cases)},
        {"PeopleCheck", fnPeopleCheckPart(run)}, {"DataColumns", fnDataColumnsPart(run)}
    },
    // Each part with its columns named <Part>.<Column> and a column Part. The type of each column is the data type of the
    // calculated table that shows it (RunColumnTypes, generated), so Run and the calculated tables never differ. Each part
    // gets the types of its own columns before the parts are put together (build B8, D307): typing the combined table
    // would convert every cell of every part, most of them empty (37,000 rows by 300 columns at real size). The empty
    // frame first gives every column its type, also the columns of a part with no rows.
    prefixed = List.Transform(parts, (part) =>
        let
            name = part{0},
            rows = part{1},
            renamed = Table.RenameColumns(rows, List.Transform(Table.ColumnNames(rows), (column) => {column, name & "." & column})),
            present = Table.ColumnNames(renamed),
            own = List.Select(RunColumnTypes, (pair) => List.Contains(present, pair{0}))
        in
            Table.AddColumn(Table.TransformColumnTypes(renamed, own), "Part", each name, type text)),
    frame = Table.TransformColumnTypes(#table(List.Transform(RunColumnTypes, (pair) => pair{0}), {}), RunColumnTypes),
    typed = Table.Combine({frame} & prefixed),
    withDate = Table.AddColumn(typed, "ReportDate", each if run = null then null else run[Date], type nullable date)
in
    Table.ReorderColumns(withDate, {"Part", "ReportDate"} & List.Select(Table.ColumnNames(withDate), (column) => column <> "Part" and column <> "ReportDate"))
