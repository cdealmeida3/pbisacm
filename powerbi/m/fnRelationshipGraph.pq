// The relationship graph of a run (src/core/checks/detectors/relationship-detectors.ts, buildGraph): each end of a
// relationship is matched to a CI of the CI report by its name (identity first), then its class, its asset tag, and the
// live one; an end that matches no CI keeps its name and class. A node: [Key, Name, Cls, Ci, Retired, Ambiguous,
// Environment]; Cls is the class the rules use (a Service Instance with Platform ticked is a Platform), Environment is
// worked out only when a check reads it. Up and Down: for each node key, the live relationships above and below it
// (neither end Retired). NodeOf: the node of any CI of the report. Unmatched and Ambiguous: the ends that match no CI,
// or two CIs that nothing tells apart.
(cis as list, relationships as list, model as record) as record =>
    let
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        retiredWords = List.Transform(model[retiredStatuses], (word) => fnNameKey(word, "")),
        isRetired = (status as text) as logical => List.Contains(retiredWords, fnNameKey(status, "")),
        ruleClass = (ci as record) as text => if ci[Class] = "service_instance" and ci[Platform] = true then "platform" else ci[Class],
        nodeOf = (ci as record) as record =>
            [Key = ci[Key], Name = ci[Name], Cls = ruleClass(ci), Ci = ci, Retired = isRetired(ci[Status]), Ambiguous = false,
                Environment = fnEnvironment(ci[Name], if ci[Environment] = null then "" else ci[Environment], model)],
        byIdentity = fnGroupBy(cis, (ci) => fnNameKey(ci[Name], "?")),
        byName = fnGroupBy(cis, (ci) => fnNameKey(ci[Name], "")),
        endOf = (name as text, className as text, tag as text) as record =>
            let
                first = Record.FieldOrDefault(byIdentity, fnNameKey(name, "?"), Record.FieldOrDefault(byName, fnNameKey(name, ""), {})),
                sameClass = List.Select(first, (ci) => ci[Class] = className),
                byClass = if List.Count(first) > 1 and className <> "" and not List.IsEmpty(sameClass) then sameClass else first,
                sameTag = List.Select(byClass, (ci) => same(ci[AssetTag], tag)),
                byTag = if List.Count(byClass) > 1 and tag <> "" and not List.IsEmpty(sameTag) then sameTag else byClass,
                live = List.Select(byTag, (ci) => not isRetired(ci[Status])),
                found = if List.Count(byTag) > 1 and not List.IsEmpty(live) then live else byTag,
                ci = if List.IsEmpty(found) then null else found{0}
            in
                if ci = null then [Key = "?" & fnNameKey(name, "?") & "|" & className, Name = name, Cls = className, Ci = null, Retired = false, Ambiguous = false,
                    Environment = fnEnvironment(name, "", model)]
                else nodeOf(ci) & [Ambiguous = List.Count(found) > 1],
        edges = List.Buffer(List.Transform(relationships, (row) =>
            [Parent = endOf(row[Parent], row[ParentClass], row[ParentTag]), Child = endOf(row[Child], row[ChildClass], row[ChildTag]), Type = row[Type], Excluded = row[Excluded]])),
        live = List.Buffer(List.Select(edges, (edge) => not edge[Parent][Retired] and not edge[Child][Retired])),
        ends = List.Combine(List.Transform(edges, (edge) => {edge[Parent], edge[Child]}))
    in
        [
            Edges = edges,
            Up = fnGroupBy(live, (edge) => edge[Child][Key]),
            Down = fnGroupBy(live, (edge) => edge[Parent][Key]),
            NodeOf = nodeOf,
            Unmatched = List.Count(List.Select(ends, (node) => node[Ci] = null)),
            Ambiguous = List.Count(List.Select(ends, (node) => node[Ambiguous]))
        ]
