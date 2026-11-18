// How a finding is listed (src/core/checks/finding-states.ts, listing): waiting (a detector says it waits, or the CI is
// not live yet: reference/not-live-statuses), known (a tag of the team explains it: reference/known-tags), review (the
// check is listed for a review only, or the detector says so), else open (to solve). Returns [State, Why].
(ci as record, pack as nullable record, review as text, wait as text) as record =>
    let
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        notLive = Record.FieldOrDefault(ReferenceFiles, "not-live-statuses", null),
        known = Record.FieldOrDefault(Record.FieldOrDefault(ReferenceFiles, "known-tags", []), "rules", {}),
        id = if pack = null then "" else pack[id],
        waits = pack = null or not List.Contains(if notLive = null then {} else Record.FieldOrDefault(notLive, "exceptChecks", {}), id),
        liveStatus = waits and List.AnyTrue(List.Transform(if notLive = null then {} else notLive[statuses], (status) => same(status, ci[Status]))),
        // The first rule of the file that has a tag of the CI, and its first such tag (as finding-states.ts loops).
        tag = List.First(List.Transform(List.Select(known, (rule) => pack <> null and List.Contains(rule[checks], id)
            and List.AnyTrue(List.Transform(ci[TagList], (candidate) => List.AnyTrue(List.Transform(rule[tags], (word) => same(word, candidate)))))), (rule) =>
            List.First(List.Select(ci[TagList], (candidate) => List.AnyTrue(List.Transform(rule[tags], (word) => same(word, candidate)))))), null),
        reviewWhy = if pack = null then "" else Record.FieldOrDefault(pack, "reviewWhy", "")
    in
        if wait <> "" then [State = "waiting", Why = wait]
        else if liveStatus then [State = "waiting", Why = "Status " & ci[Status] & ": not live yet"]
        else if tag <> null then [State = "known", Why = "Tagged " & tag]
        else if pack <> null and Record.FieldOrDefault(pack, "reviewOnly", false) = true then [State = "review", Why = if reviewWhy <> "" then reviewWhy else "Allowed: listed for a review"]
        else if review <> "" then [State = "review", Why = review]
        else [State = "open", Why = ""]
