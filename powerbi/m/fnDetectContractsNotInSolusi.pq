// Not in Solusi (code detector contracts/not-in-solusi, src/core/checks/detectors/contract-detectors.ts): a contract in
// ServiceNow that the Solusi contract file does not hold, or that has no Solusi number at all (typed in by hand), is to
// delete (D144). "Still linked" only says what links it to the CMDB: a criticality from a CI, the tag that sets the
// criticality by hand, or a running status that has not ended at the date of the CI report. SACM deletes it; the report
// deletes nothing. Every finding carries its contract as Subject (fnContractSubject).
(pack as record, run as record, config as record) as record =>
    let
        words = ContractWords,
        contracts = run[Contracts],
        date = run[Date],
        solusiDate = if contracts[Solusi][Date] = null then "" else fnLongDate(contracts[Solusi][Date]),
        stillLinked = (contract as record) as text =>
            let
                tag = words[TargetTag](contract, config),
                running = words[InList](config[runningStatuses], contract[State]) and (contract[End] = null or date = null or contract[End] >= date),
                reasons = (if contract[Criticality] = true then {"it carries a criticality from a CI"} else {})
                    & (if tag <> "" then {"it is tagged " & tag} else {})
                    & (if running then {if contract[End] <> null then "it is " & contract[State] & " and ends " & fnLongDate(contract[End]) else "it is " & contract[State] & " with no end date"} else {})
            in
                if List.IsEmpty(reasons) then "" else "Still linked: " & Text.Combine(reasons, "; "),
        findingOf = (contract as record) as record =>
            let
                note = stillLinked(contract),
                state = if contract[State] = "" then "empty" else contract[State],
                detail = if contract[VendorContract] = ""
                    then "In ServiceNow with no Solusi contract number (status " & state & "): it does not come from Solusi"
                    else "In ServiceNow (status " & state & "), not in the Solusi contract file of " & solusiDate,
                subject = fnContractSubject(contract, null)
            in
                fnFinding(pack, subject, "record", if note <> "" then detail & ". " & note else detail, [
                    Fix = [Change = "Delete the contract in ServiceNow", Current = contract[Number] & ", " & (if contract[State] = "" then "no status" else contract[State]), Set = "Deleted", Note = note],
                    Subject = subject])
    in
        [
            Findings = List.Buffer(List.Transform(contracts[NotInSolusi] & contracts[NoNumber], findingOf)),
            Tested = {pack[id] & ":record"},
            Evaluated = {[Part = pack[id] & ":record", Count = List.Count(contracts[ServiceNow][Contracts])]},
            Notes = {}
        ]
