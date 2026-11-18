// A report with no header and no row: the readers turn it into an empty table with all their columns.
let
    sheet = [Name = "", RawHeaders = {}, Headers = {}, Rows = #table({}, {})]
in
    [Format = "", Sheets = {sheet}, Headers = {}, RawHeaders = {}, Rows = sheet[Rows]]
