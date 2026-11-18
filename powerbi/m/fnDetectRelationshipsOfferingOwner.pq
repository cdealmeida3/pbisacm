// Offering owner ≠ Service owner (code detector relationships/offering-owner, relationship-detectors.ts; procedure 2.6):
// a Service Offering made by a person has the owner of its one Business Service. An offering the EPO integration created
// takes it from EPO by itself and is not checked here (D137). SACM copies the owner (a SACM fix list).
(pack as record, run as record, inScope as list, model as record) as record =>
    let
        graph = run[Graph],
        columns = run[Columns],
        owner = (ci as record) as nullable record => fnPerson(ci, "owned_by", columns),
        offerings = List.Select(inScope, (ci) => graph[NodeOf](ci)[Cls] = "service_offering"),
        fromEpo = List.Count(List.Select(offerings, (ci) => fnOfferingOrigin(ci) = "epo")),
        checked = List.Buffer(List.RemoveNulls(List.Transform(List.Select(offerings, (ci) => fnOfferingOrigin(ci) <> "epo"), (ci) =>
            let services = fnPartners(graph, graph[NodeOf](ci), "parent", {"business_service"}) in
            if List.Count(services) <> 1 or services{0}[Ci] = null then null else [Ci = ci, Service = services{0}[Ci]]))),
        findings = List.RemoveNulls(List.Transform(checked, (entry) =>
            let
                ci = entry[Ci],
                service = entry[Service],
                current = fnPersonText(owner(ci)),
                set = fnPersonText(owner(service))
            in
                if fnSamePerson(owner(ci), owner(service)) then null
                else fnFinding(pack, ci, "service-owner", "Owned by is " & current & "; its Business Service " & service[Name] & " is owned by " & set,
                    [Fix = [Change = "Owned by (as on " & service[Name] & ")", Current = current, Set = set] & (if set <> "" and set <> "(empty)" then [Value = set] else [])])))
    in
        if not List.Contains(columns, "owned_by") then [Findings = {}, Tested = {}, Evaluated = {}, Notes = {"Not tested: " & fnMissingColumns({"owned_by"}) & "."}]
        else [
            Findings = List.Buffer(findings), Tested = {pack[id] & ":service-owner"}, Evaluated = {[Part = pack[id] & ":service-owner", Count = List.Count(checked)]},
            Notes = if fromEpo = 0 then {} else {fnPlural(fromEpo, "Service Offering") & " " & (if fromEpo = 1 then "comes" else "come") & " from EPO: "
                & (if fromEpo = 1 then "it takes its" else "they take their") & " owner from EPO and " & (if fromEpo = 1 then "is" else "are") & " not checked here."}
        ]
