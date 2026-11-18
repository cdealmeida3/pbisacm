// To clear by hand (code detector contracts/to-clear, src/core/checks/detectors/contract-detectors.ts): the import from
// Solusi never clears a field (known challenge 2), so a value Procurement removed in Solusi stays in ServiceNow until SACM
// clears it. An old end date matters most: ServiceNow shows the contract as Expired because of it.
(pack as record, run as record, config as record) as record =>
    let
        words = ContractWords,
        contracts = run[Contracts],
        pairs = contracts[Pairs],
        solusiDate = if contracts[Solusi][Date] = null then "" else fnLongDate(contracts[Solusi][Date]),
        fields = List.Buffer(List.Transform(config[fields], (entry) => entry & [Column = fnPascal(entry[field])])),
        findings = List.Combine(List.Transform(pairs, (pair) => List.Transform(
            List.Select(fields, (entry) => words[Blank](Record.Field(pair[Solusi], entry[Column])) and not words[Blank](Record.Field(pair[ServiceNow], entry[Column]))),
            (entry) =>
                let
                    shown = words[Shown](Record.Field(pair[ServiceNow], entry[Column])),
                    state = pair[ServiceNow][State],
                    expired = if entry[field] = "end" and words[InList](config[autoStates], state) then "; ServiceNow shows the contract as " & state & " only because of it" else ""
                in
                    fnFinding(pack, pair[Subject], entry[field],
                        entry[label] & " is empty in the Solusi contract file of " & solusiDate & ", ServiceNow still has " & shown & expired,
                        [Fix = [Change = entry[label] & ": clear it", Current = shown, Set = "empty (empty in Solusi)"], Subject = pair[Subject]]))))
    in
        [
            Findings = List.Buffer(findings),
            Tested = List.Transform(fields, (entry) => pack[id] & ":" & entry[field]),
            Evaluated = List.Transform(fields, (entry) => [Part = pack[id] & ":" & entry[field], Count = List.Count(pairs)]),
            Notes = {}
        ]
