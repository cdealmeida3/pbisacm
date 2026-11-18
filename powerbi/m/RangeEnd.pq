// The day after the last day of the history the table HistoryRun computes (D290), with RangeStart. In the workspace the
// incremental refresh sets it for each part of the history; in Power BI Desktop keep it in the future.
#datetime(2030, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]
