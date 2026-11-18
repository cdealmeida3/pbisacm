// Table About: one row. The version of the Workbench, where the data comes from, and the day the samples were recorded:
// in Sample mode the report counts the age of a report from that day, so the samples look as on the day they were made.
#table(
    type table [Version = text, SourceMode = text, Data = text, SampleDate = date, RefreshedAt = datetime],
    {{WorkbenchVersion, SourceMode,
        if SourceMode = "SharePoint" then "Reports from the SharePoint folder" else "Invented sample data, packed in this file",
        SampleDate, DateTime.LocalNow()}})
