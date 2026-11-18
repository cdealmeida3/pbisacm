// The files of the reports folder in SharePoint: FileName, Modified, Content. Only read when SourceMode is "SharePoint".
// SharePoint.Contents opens one folder, which is much faster than SharePoint.Files on a big team site.
() as table =>
    let
        site = SharePoint.Contents(SharePointSite, [ApiVersion = 15]),
        parts = List.Select(Text.Split(ReportsFolder, "/"), each _ <> ""),
        folder = List.Accumulate(parts, site, (node, part) => node{[Name = part]}[Content]),
        files = Table.SelectRows(folder, each Value.Is([Content], type binary)),
        selected = Table.SelectColumns(files, {"Name", "Date modified", "Content"}),
        renamed = Table.RenameColumns(selected, {{"Name", "FileName"}, {"Date modified", "Modified"}})
    in
        Table.TransformColumnTypes(renamed, {{"FileName", type text}, {"Modified", type nullable datetime}, {"Content", type binary}})
