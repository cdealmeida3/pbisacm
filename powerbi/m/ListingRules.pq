// The reference files that decide how a finding is listed (fnListing), with their words in compared form, made once:
// reference/not-live-statuses (NotLive: null when missing) and the rules of reference/known-tags.
let
    notLive = Record.FieldOrDefault(ReferenceFiles, "not-live-statuses", null),
    known = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "known-tags", []), "rules", {})
in
    [
        NotLive = notLive,
        NotLiveKeys = if notLive = null then {} else List.Buffer(List.Transform(notLive[statuses], (status) => fnNameKey(status, ""))),
        ExceptChecks = if notLive = null then {} else Record.FieldOrDefault(notLive, "exceptChecks", {}),
        Known = List.Buffer(List.Transform(known, (rule) => rule & [TagKeys = List.Buffer(List.Transform(rule[tags], (word) => fnNameKey(word, "")))]))
    ]
