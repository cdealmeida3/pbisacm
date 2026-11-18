// Table Runs: one row per CI report, with the other reports its checks use: for each type the newest report at or before
// the CI report's date (as the HTML app pairs them).
let
    cis = Table.SelectRows(ReadFiles, each [Kind] = "ci"),
    pick = (kind as text, date as nullable date) as nullable text =>
        let
            candidates = Table.SelectRows(ReadFiles, each [Kind] = kind and [ReportDate] <> null and date <> null and [ReportDate] <= date),
            sorted = Table.Sort(candidates, {{"ReportDate", Order.Ascending}, {"FileName", Order.Ascending}})
        in
            if Table.IsEmpty(sorted) then null else Table.Last(sorted)[FileName],
    withCis = Table.AddColumn(cis, "CIs", each fnCiCount([Read]), Int64.Type),
    withRelationship = Table.AddColumn(withCis, "RelationshipFile", each pick("relationship", [ReportDate]), type nullable text),
    withEpo = Table.AddColumn(withRelationship, "EpoFile", each pick("epo", [ReportDate]), type nullable text),
    withSolusi = Table.AddColumn(withEpo, "SolusiFile", each pick("solusi", [ReportDate]), type nullable text),
    withContract = Table.AddColumn(withSolusi, "ContractFile", each pick("contract", [ReportDate]), type nullable text)
in
    Table.TransformColumnTypes(
        Table.SelectColumns(withContract, {"ReportDate", "FileName", "CIs", "RelationshipFile", "EpoFile", "SolusiFile", "ContractFile"}),
        {{"FileName", type text}})
