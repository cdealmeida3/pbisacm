// Where the report files come from. "Sample": the invented samples packed inside this file (no sign-in, no path).
// "SharePoint": the report files in the team's SharePoint folder (SharePointSite and ReportsFolder). Nothing after the
// source step knows the mode (D271).
"Folder" meta [IsParameterQuery = true, List = {"Sample", "SharePoint", "Folder"}, DefaultValue = "Folder", Type = "Text", IsParameterQueryRequired = true]
