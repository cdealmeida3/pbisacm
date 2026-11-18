// "the report has no column "Supported by (active)" (supported_by.active)": the label first, the technical name for
// whoever builds the report (src/core/shared/text.ts, missingColumns).
(columns as list) as text =>
    "the report has no column " & Text.Combine(List.Transform(columns, (column) =>
        let word = fnColumnWord(column) in
        if fnMatches(ReadingRules[technicalColumn], "", column) and word <> column then """" & word & """ (" & column & ")" else """" & word & """"), ", ")
