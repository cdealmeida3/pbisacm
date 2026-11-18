// Upload check (code detector contracts/upload-check, src/core/checks/detectors/contract-detectors.ts): a field differs
// between Solusi and ServiceNow after the import, the status was not imported, or a contract is not in ServiceNow yet. A
// SACM fix list grouped by field (D146): SACM first asks "was this Solusi file uploaded?", then sets the Solusi value. A
// person's name is not here (card "Contracts to fix in ServiceNow"), nor a vendor that is empty because Solusi has no
// vendor number (card "For Procurement").
(pack as record, run as record, config as record) as record =>
    let
        words = ContractWords,
        contracts = run[Contracts],
        pairs = contracts[Pairs],
        parts = List.Transform(config[fields], (entry) => entry[field]) & {"status", "record"},
        lines = (pair as record) as list =>
            let
                solusi = pair[Solusi],
                state = pair[ServiceNow][State],
                kept = List.Select(pair[Differences], (difference) => difference[Kind] <> "person"
                    and not (difference[Field] = "vendor" and words[Blank](difference[ServiceNow]) and solusi[VendorNumber] = "")),
                fields = List.Transform(kept, (difference) =>
                    let
                        now = if words[Blank](difference[ServiceNow]) then "nothing" else words[Shown](difference[ServiceNow]),
                        value = words[Shown](difference[Solusi])
                    in
                        fnFinding(pack, pair[Subject], difference[Field], difference[Label] & ": Solusi has " & value & ", ServiceNow has " & now, [
                            Fix = [Change = difference[Label] & ": set the value of Solusi", Current = now, Set = value, Value = if difference[Kind] = "text" then difference[Solusi] else ""],
                            Problem = difference[Label], Subject = pair[Subject]])),
                status = if solusi[Status] <> "" and state <> "" and not words[InList](config[autoStates], state) and not words[SameWord](state, solusi[Status]) then
                    {fnFinding(pack, pair[Subject], "status", "Status: Solusi has " & solusi[Status] & ", ServiceNow has " & state, [
                        Fix = [Change = "Status: set the status of Solusi", Current = state, Set = solusi[Status]], Problem = "Status", Subject = pair[Subject]])}
                    else {}
            in
                fields & status,
        missing = List.Transform(contracts[NotInServiceNow], (contract) =>
            let subject = fnContractSubject(null, contract) in
            fnFinding(pack, subject, "record",
                "In the Solusi contract file (" & (if contract[Status] = "" then "no status" else contract[Status]) & (if contract[Start] <> null then ", starts " & fnLongDate(contract[Start]) else "") & "), not in ServiceNow yet",
                [Fix = [Change = "Bring the contract into ServiceNow (upload the Solusi contract file again, or create it)", Current = "not in ServiceNow", Set = "in ServiceNow"],
                    Problem = "Not in ServiceNow yet", Subject = subject]))
    in
        [
            Findings = List.Buffer(List.Combine(List.Transform(pairs, lines)) & missing),
            Tested = List.Transform(parts, (part) => pack[id] & ":" & part),
            Evaluated = List.Transform(parts, (part) => [Part = pack[id] & ":" & part, Count = if part = "record" then List.Count(contracts[Solusi][Contracts]) else List.Count(pairs)]),
            Notes = {}
        ]
