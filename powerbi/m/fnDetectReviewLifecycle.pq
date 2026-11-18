// The lifecycle review (manual detector review/lifecycle, D192): it reads no report, so on a CI report alone it finds
// nothing and tests nothing. Its lines come from the managers' marks in the journal, added to the newest run only
// (fnWithReviews, build B8, D306); the history (HistoryRun) keeps the checks of the reports alone.
(pack as record, run as record, inScope as list, reference as nullable record) as record =>
    [Findings = {}, Tested = {}, Evaluated = {}, Notes = {}]
