// The files of the reports folder in SharePoint: FileName, Modified, Content. Only read when SourceMode is "SharePoint".
// SharePoint.Contents opens one folder, which is much faster than SharePoint.Files on a big team site.
() as table =>
    let
        site = SharePoint.Contents(SharePointSite, [ApiVersion = 15]),
        parts = List.Select(Text.Split(ReportsFolder, "/"), each _ <> ""),
        folder = List.Accumulate(parts, site, (node, part) => node{[Name = part]}[Content]),
        // Only the files of the folder: a sub-folder (its Content is a table) is never read, so old reports moved
        // into a sub-folder Archive leave the history (D336, README §4A).
        files = Table.SelectRows(folder, each Value.Is([Content], type binary)),
        selected = Table.SelectColumns(files, {"Name", "Date modified", "Content"}),
        renamed = Table.RenameColumns(selected, {{"Name", "FileName"}, {"Date modified", "Modified"}})
    in
        Table.TransformColumnTypes(renamed, {{"FileName", type text}, {"Modified", type nullable datetime}, {"Content", type binary}})
