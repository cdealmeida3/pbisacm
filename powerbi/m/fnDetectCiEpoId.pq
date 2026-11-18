// The EPO ID (code detector ci/epo-id, src/core/checks/detectors/ci-detectors.ts). The EPO ID is the asset tag
// (reference/epo-id): missing on a class that must have one (or listed for a review), and two live CIs that share one.
(pack as record, run as record, inScope as list, reference as record) as record =>
    let
        columns = run[Columns],
        required = Record.FieldOrDefault(reference, "required", {}),
        reviewWhen = Record.FieldOrDefault(reference, "reviewWhenMissing", {}),
        reviewWhy = Record.FieldOrDefault(reference, "reviewWhy", ""),
        applies = (classes as nullable list, ci as record) as logical => classes = null or List.Contains(classes, "*") or List.Contains(classes, ci[Class]),
        exempt = (ci as record) as logical => List.AnyTrue(List.Transform(Record.FieldOrDefault(reference, "notNeeded", {}), (rule) => applies(rule[classes], ci) and fnMatches(rule[name], "", ci[Name]))),
        checked = List.Select(inScope, (ci) => (List.Contains(required, ci[Class]) or List.Contains(reviewWhen, ci[Class])) and not exempt(ci)),
        missing = [
            Findings = List.Transform(List.Select(checked, (ci) => ci[AssetTag] = ""), (ci) =>
                fnFinding(pack, ci, "missing", "No EPO ID", if List.Contains(required, ci[Class]) then [] else [Review = if reviewWhy <> "" then reviewWhy else "Review only"])),
            Tested = {pack[id] & ":missing"}, Evaluated = {[Part = pack[id] & ":missing", Count = List.Count(checked)]}, Notes = {}
        ],
        // The number of a Service Offering against its Business Service needs a part of the pattern back: not built in Power BI yet.
        number = if Record.HasFields(reference, "offeringNumber")
            then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested for the number of the Business Service: this part is not built in the Power BI version yet."}]
            else [Findings = {}, Tested = {}, Evaluated = {}, Notes = {}],
        tagged = List.Select(inScope, (ci) => ci[AssetTag] <> ""),
        byTag = fnGroupBy(tagged, (ci) => Text.Lower(ci[AssetTag], "en-US")),
        repeated = List.Select(Record.FieldValues(byTag), (list) => List.Count(list) > 1),
        duplicate = if Record.FieldOrDefault(reference, "unique", false) <> true then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {}] else [
            Findings = List.Combine(List.Transform(repeated, (list) => List.Transform(List.Positions(list), (at) =>
                let
                    ci = list{at},
                    others = List.Sort(List.Transform(List.RemoveRange(list, at, 1), (other) => other[Name]), Comparer.FromCulture("en-US"))
                in
                    fnFinding(pack, ci, "duplicate", "EPO ID " & ci[AssetTag] & " is also on " & Text.Combine(others, ", "))))),
            Tested = {pack[id] & ":duplicate"}, Evaluated = {[Part = pack[id] & ":duplicate", Count = List.Count(tagged)]}, Notes = {}
        ]
    in
        if not List.Contains(columns, "assetTag") then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the report has no column for the EPO ID (asset_tag)."}]
        else fnCombineOutputs({missing, number, duplicate})
