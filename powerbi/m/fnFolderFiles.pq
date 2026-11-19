// PREVIEW ONLY: the files of a local folder of the runner (C:\preview-data), as SharePoint mode gives them. Only the
// files of the folder itself, as D336.
() as table =>
    let
        files = Folder.Files("C:\preview-data"),
        top = Table.SelectRows(files, each Text.Lower([Folder Path], "en-US") = "c:\preview-data\"),
        selected = Table.SelectColumns(top, {"Name", "Date modified", "Content"}),
        renamed = Table.RenameColumns(selected, {{"Name", "FileName"}, {"Date modified", "Modified"}})
    in
        Table.TransformColumnTypes(renamed, {{"FileName", type text}, {"Modified", type nullable datetime}, {"Content", type binary}})
