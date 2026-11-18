// Table HistoryRun (hidden, D290): the checks on every CI report dated from RangeStart to RangeEnd (fnHistoryRun). In the
// workspace the incremental refresh sets the two dates for each part of the history, so an old report date is computed
// once; in Power BI Desktop the dates of the parameters count.
fnHistoryRun(RangeStart, RangeEnd)
