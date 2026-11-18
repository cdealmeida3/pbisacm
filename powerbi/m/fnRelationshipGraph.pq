// The relationship graph of a run (src/core/checks/detectors/relationship-detectors.ts, buildGraph): each end of a
// relationship is matched to a CI of the CI report by its name (identity first), then its class, its asset tag, and the
// live one; an end that matches no CI keeps its name and class. A node: [Key, Name, Cls, Ci, Retired, Environment],
// one per CI (every end that matches the CI is the same node); Cls is the class the rules use (a Service Instance with Platform ticked is a Platform), Environment is
// worked out only when a check reads it. Up and Down: for each node key, the live relationships above and below it
// (neither end Retired). NodeOf: the node of any CI of the report. Unmatched and Ambiguous: the ends that match no CI,
// or two CIs that nothing tells apart. `cis` are the CIs of fnCheckRun, with their normal forms (StatusKey, NameKey).
(cis as list, relationships as list, model as record) as record =>
    let
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        retiredWords = List.Buffer(List.Transform(model[retiredStatuses], (word) => fnNameKey(word, ""))),
        isRetired = (ci as record) as logical => List.Contains(retiredWords, ci[StatusKey]),
        ruleClass = (ci as record) as text => if ci[Class] = "service_instance" and ci[Platform] = true then "platform" else ci[Class],
        nodeOf = (ci as record) as record =>
            [Key = ci[Key], Name = ci[Name], Cls = ruleClass(ci), Ci = ci, Retired = isRetired(ci),
                Environment = fnEnvironment(ci[Name], if ci[Environment] = null then "" else ci[Environment], model)],
        // One node per CI, made once: every end of a relationship that matches the CI is this node, so its Environment
        // is worked out once per CI, the first time a check reads it.
        nodes = Record.FromList(List.Transform(cis, nodeOf), List.Transform(cis, (ci) => ci[Key])),
        byIdentity = fnGroupBy(cis, (ci) => ci[IdentityKey]),
        byName = fnGroupBy(cis, (ci) => ci[NameKey]),
        // The node of an end, and whether two CIs that nothing tells apart could be it.
        endOf = (name as text, className as text, tag as text) as record =>
            let
                first = Record.FieldOrDefault(byIdentity, fnNameKey(name, "?"), Record.FieldOrDefault(byName, fnNameKey(name, ""), {})),
                sameClass = List.Select(first, (ci) => ci[Class] = className),
                byClass = if List.Count(first) > 1 and className <> "" and not List.IsEmpty(sameClass) then sameClass else first,
                sameTag = List.Select(byClass, (ci) => same(ci[AssetTag], tag)),
                byTag = if List.Count(byClass) > 1 and tag <> "" and not List.IsEmpty(sameTag) then sameTag else byClass,
                live = List.Select(byTag, (ci) => not isRetired(ci)),
                found = if List.Count(byTag) > 1 and not List.IsEmpty(live) then live else byTag,
                ci = if List.IsEmpty(found) then null else found{0}
            in
                if ci = null then [Node = [Key = "?" & fnNameKey(name, "?") & "|" & className, Name = name, Cls = className, Ci = null, Retired = false,
                    Environment = fnEnvironment(name, "", model)], Ambiguous = false]
                else [Node = Record.Field(nodes, ci[Key]), Ambiguous = List.Count(found) > 1],
        edges = List.Buffer(List.Transform(relationships, (row) =>
            let parent = endOf(row[Parent], row[ParentClass], row[ParentTag]), child = endOf(row[Child], row[ChildClass], row[ChildTag]) in
            [Parent = parent[Node], Child = child[Node], Type = row[Type], Excluded = row[Excluded],
                Ambiguous = (if parent[Ambiguous] then 1 else 0) + (if child[Ambiguous] then 1 else 0)])),
        live = List.Buffer(List.Select(edges, (edge) => not edge[Parent][Retired] and not edge[Child][Retired]))
    in
        [
            Edges = edges,
            Up = fnGroupBy(live, (edge) => edge[Child][Key]),
            Down = fnGroupBy(live, (edge) => edge[Parent][Key]),
            NodeOf = (ci as record) as record => let node = Record.FieldOrDefault(nodes, ci[Key], null) in if node = null then nodeOf(ci) else node,
            Unmatched = List.Sum({0} & List.Transform(edges, (edge) => (if edge[Parent][Ci] = null then 1 else 0) + (if edge[Child][Ci] = null then 1 else 0))),
            Ambiguous = List.Sum({0} & List.Transform(edges, (edge) => edge[Ambiguous]))
        ]
