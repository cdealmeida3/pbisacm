// A report file as sheets. The format comes from the content (an .xlsx is a zip), never from the file name. A CSV file
// has one sheet; an .xlsx file has every sheet in workbook order. Headers and Rows are those of the first sheet.
// Lossless: the file keeps hidden characters (an .xlsx, or a CSV with a byte order mark or a hidden character in it), as
// src/core/reading/table.ts says it.
(content as binary) as record =>
    let
        isZip = Binary.Length(content) >= 2 and Binary.ToList(Binary.Range(content, 0, 2)) = {80, 75},
        hasBom = Binary.Length(content) >= 3 and Binary.ToList(Binary.Range(content, 0, 3)) = {239, 187, 191},
        text = if isZip then "" else fnDecodeText(content),
        hidden = List.Transform(ReadingRules[hiddenCharacters], (entry) => Character.FromNumber(entry[code])),
        workbook = Excel.Workbook(content, false, true),
        sheets =
            if isZip then
                List.Transform(Table.ToRecords(Table.SelectRows(workbook, each [Kind] = "Sheet")), (sheet) => fnSheet(sheet[Name], sheet[Data]))
            else
                {fnSheetFromCsv(text)},
        first = if List.IsEmpty(sheets) then [Name = "", RawHeaders = {}, Headers = {}, Rows = #table({}, {})] else sheets{0}
    in
        [Format = if isZip then "xlsx" else "csv", Sheets = sheets, Headers = first[Headers], RawHeaders = first[RawHeaders], Rows = first[Rows],
            Lossless = isZip or hasBom or List.AnyTrue(List.Transform(hidden, (char) => Text.Contains(text, char)))]
