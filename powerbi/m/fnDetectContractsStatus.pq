// Contract status (code detector contracts/status, src/core/checks/detectors/contract-detectors.ts): ServiceNow sets
// "Expired" by itself from the end date (known challenge 4), so the real Solusi status is kept as a tag. A contract that
// ServiceNow shows as Expired needs the tag of the Solusi status; a contract whose status was imported carries no other
// status tag. Contracts of the tab "terminated in the last 7 days" are checked the same way (known challenge 3). A status
// that differs while ServiceNow did not set it is on the card "Upload check".
(pack as record, run as record, config as record) as record =>
    let
        words = ContractWords,
        pairs = run[Contracts][Pairs],
        findingOf = (pair as record) as nullable record =>
            let
                wanted = pair[Solusi][Status],
                contract = pair[ServiceNow],
                state = contract[State],
                tag = words[StatusTag](contract, config),
                from = if pair[Solusi][Sheet] = "terminated" then " (terminated in the last 7 days)" else "",
                line = (detail as text, fix as record) as record => fnFinding(pack, pair[Subject], "status", detail, [Fix = fix, Subject = pair[Subject]])
            in
                if wanted = "" then null
                else if words[InList](config[autoStates], state) then
                    (if tag = "" then line("ServiceNow shows " & state & " and has no status tag. Solusi says " & wanted & from,
                        [Change = "Add the tag " & wanted, Current = state & ", no status tag", Set = "tag " & wanted])
                    else if not words[SameWord](tag, wanted) then line("ServiceNow shows " & state & " with the tag " & tag & ". Solusi says " & wanted & from,
                        [Change = "Change the tag " & tag & " to " & wanted, Current = "tag " & tag, Set = "tag " & wanted])
                    else null)
                else if words[SameWord](state, wanted) and tag <> "" and not words[SameWord](tag, wanted) then
                    line("ServiceNow shows " & state & ", like Solusi, but carries the tag " & tag,
                        [Change = "Remove the tag " & tag, Current = state & ", tag " & tag, Set = "no other status tag"])
                else null
    in
        [
            Findings = List.Buffer(List.RemoveNulls(List.Transform(pairs, findingOf))),
            Tested = {pack[id] & ":status"},
            Evaluated = {[Part = pack[id] & ":status", Count = List.Count(pairs)]},
            Notes = {}
        ]
