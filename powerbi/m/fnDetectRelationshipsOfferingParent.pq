// Offering parent (code detector relationships/offering-parent, relationship-detectors.ts): the Parent field of a Service
// Offering and its Business Service relationship name the same, single Business Service. A SACM fix list: the field is
// set, the relationship added, or the extra relationships removed. Neither field nor relationship: Relationship missing
// asks the owner.
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        same = (a as text, b as text) as logical => fnNameKey(a, "") = fnNameKey(b, ""),
        offerings = List.Select(inScope, (ci) => graph[NodeOf](ci)[Cls] = "service_offering"),
        findings = List.RemoveNulls(List.Transform(offerings, (ci) =>
            let
                parent = Text.Trim(if ci[ParentService] = null then "" else ci[ParentService]),
                services = fnPartners(graph, graph[NodeOf](ci), "parent", {"business_service"}),
                listed = fnSortedNames(services),
                offering = ci[Name],
                named = List.AnyTrue(List.Transform(services, (service) => same(service[Name], parent))),
                others = fnSortedNames(List.Select(services, (service) => not same(service[Name], parent))),
                line =
                    if parent = "" then
                        (if List.IsEmpty(services) then null
                        else [Detail = "The Parent field is empty; the relationship names " & listed,
                            Fix = if List.Count(services) = 1 then [Change = "Set the Parent field of " & offering, Current = "(empty)", Set = services{0}[Name], Value = services{0}[Name]] else null])
                    else if List.IsEmpty(services) then
                        [Detail = "The Parent field names " & parent & ", but no Business Service is related",
                            Fix = [Change = "Add the relationship " & parent & " Provides::Provided by " & offering, Current = "No Business Service related", Set = parent, Value = parent]]
                    else if not named then
                        [Detail = "The Parent field names " & parent & "; the relationship names " & listed,
                            Fix = [Change = "Business Service of " & offering & ": check which is right", Current = "Relationship: " & listed, Set = "Parent field: " & parent]]
                    else if List.Count(services) > 1 then
                        [Detail = "The Parent field names " & parent & "; there are also relationships to " & others,
                            Fix = [Change = "Remove the extra Business Service relationships of " & offering, Current = others, Set = "Keep only " & parent]]
                    else null
            in
                if line = null then null else fnFinding(pack, ci, "parent", line[Detail], if line[Fix] = null then null else [Fix = line[Fix]])))
    in
        if not List.Contains(run[Columns], "parentService") then
            [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: the report has no Parent column (ref_cmdb_ci_service.parent). Add it to the CI report."}]
        else [Findings = List.Buffer(findings), Tested = {pack[id] & ":parent"}, Evaluated = {[Part = pack[id] & ":parent", Count = List.Count(offerings)]}, Notes = {}]
