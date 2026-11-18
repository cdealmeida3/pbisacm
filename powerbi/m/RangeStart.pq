// The first day of the history the table HistoryRun computes (D290). In the workspace the incremental refresh sets it for
// each part of the history (keep 24 months, look at the last 7 days); in Power BI Desktop only the CI reports from this
// day to RangeEnd are computed, so keep it a few weeks back. The invented samples are of 4 and 11 November 2026.
#datetime(2026, 11, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]
