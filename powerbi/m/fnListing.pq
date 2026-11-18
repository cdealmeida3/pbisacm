// How a finding is listed (src/core/checks/finding-states.ts, listing): waiting (a detector says it waits, or the CI is
// not live yet: reference/not-live-statuses), known (a tag of the team explains it: reference/known-tags), review (the
// check is listed for a review only, or the detector says so), else open (to solve). Returns [State, Why].
(ci as record, pack as nullable record, review as text, wait as text) as record =>
    let
        rules = ListingRules,
        id = if pack = null then "" else pack[id],
        waits = pack = null or not List.Contains(rules[ExceptChecks], id),
        liveStatus = waits and List.Contains(rules[NotLiveKeys], ci[StatusKey]),
        // The first rule of the file that has a tag of the CI, and its first such tag (as finding-states.ts loops).
        tags = ci[TagList],
        keys = ci[TagKeys],
        first = (entry as record) as nullable number => List.First(List.Select(List.Positions(keys), (at) => List.Contains(entry[TagKeys], keys{at})), null),
        rule = if pack = null then null else List.First(List.Select(rules[Known], (candidate) => List.Contains(candidate[checks], id) and first(candidate) <> null), null),
        tag = if rule = null then null else tags{first(rule)},
        reviewWhy = if pack = null then "" else Record.FieldOrDefault(pack, "reviewWhy", "")
    in
        if wait <> "" then [State = "waiting", Why = wait]
        else if liveStatus then [State = "waiting", Why = "Status " & ci[Status] & ": not live yet"]
        else if tag <> null then [State = "known", Why = "Tagged " & tag]
        else if pack <> null and Record.FieldOrDefault(pack, "reviewOnly", false) = true then [State = "review", Why = if reviewWhy <> "" then reviewWhy else "Allowed: listed for a review"]
        else if review <> "" then [State = "review", Why = review]
        else [State = "open", Why = ""]
