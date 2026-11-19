// Table About: one row. The version of the Workbench, where the data comes from, and the day the samples were recorded:
// in Sample mode the report counts the age of a report from that day, so the samples look as on the day they were made.
// The time of the refresh twice: RefreshedAt as the engine's clock gives it (the PC's time in Desktop, UTC in the
// service), and RefreshedUtc always in UTC (D335): the rail says how long ago it was, and the apps show it in the
// browser's time (the measure Report at). RefreshRule: the refresh rule in words (powerbi/apps/refresh.json, D333).
#table(
    type table [Version = text, SourceMode = text, Data = text, SampleDate = date, RefreshedAt = datetime, RefreshedUtc = datetime, RefreshRule = text],
    {{WorkbenchVersion, if SourceMode = "Folder" then "Sample" else SourceMode,
        if SourceMode = "Folder" then "Invented data at real size" else if SourceMode = "SharePoint" then "Reports from the SharePoint folder" else "Invented sample data, packed in this file",
        SampleDate, DateTime.LocalNow(), DateTimeZone.RemoveZone(DateTimeZone.UtcNow()), RefreshRule[Text]}})
