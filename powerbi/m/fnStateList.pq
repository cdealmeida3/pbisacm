// One list of the team's state (D291), by its id in StateLists (journal, replies, settings, team, reviews): its columns
// in the order of StateLists, every value as text, whatever the mode. A date and time is yyyy-MM-ddTHH:mm:ss, a date
// yyyy-MM-dd, a yes/no Yes or No, an empty cell "". Sample: the invented CSV file packed in StateFiles. SharePoint: the
// list of that name on the team site (SharePoint.Tables, plan §5). A list that is not there gives no rows, so a site
// without the lists still refreshes and every case is New.
(id as text) as table =>
    let
        spec = Record.Field(StateLists, id),
        columns = List.Buffer(spec[columns]),
        sample = Table.SelectRows(StateFiles, each [FileName] = spec[file]),
        sampleRows =
            if Table.IsEmpty(sample) then {}
            else
                let
                    csv = Csv.Document(Binary.FromText(sample{0}[Base64], BinaryEncoding.Base64), [Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
                    promoted = Table.PromoteHeaders(csv, [PromoteAllScalars = true])
                in
                    Table.ToRecords(promoted),
        sharePointRows =
            let
                lists = SharePoint.Tables(SharePointSite, [Implementation = "2.0", ViewMode = "All"]),
                found = Table.SelectRows(lists, each [Title] = spec[list])
            in
                if Table.IsEmpty(found) then {} else Table.ToRecords(found{0}[Items]),
        rows = if StateMode = "SharePoint" then sharePointRows else if StateMode = "None" then {} else sampleRows,
        asText = (value as any) as text =>
            if value = null then ""
            else if value is datetimezone then DateTime.ToText(DateTimeZone.RemoveZone(DateTimeZone.ToLocal(value)), [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"])
            else if value is datetime then DateTime.ToText(value, [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"])
            else if value is date then Date.ToText(value, [Format = "yyyy-MM-dd", Culture = "en-US"])
            else if value is logical then (if value then "Yes" else "No")
            else if value is number then Number.ToText(value, "G", "en-US")
            else if value is text then value
            else "",
        cells = List.Transform(rows, (row) => List.Transform(columns, (column) => asText(Record.FieldOrDefault(row, column, null))))
    in
        Table.TransformColumnTypes(#table(columns, cells), List.Transform(columns, (column) => {column, type text}))
