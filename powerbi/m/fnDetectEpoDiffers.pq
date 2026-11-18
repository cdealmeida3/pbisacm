// EPO ≠ ServiceNow (code detector epo/differs, src/core/checks/detectors/epo-detectors.ts): a service mapped CI differs
// from its EPO system. SACM copies the EPO value into ServiceNow (a SACM fix list). A leftover is on neither EPO card
// (D190). The chip "changed in EPO": the system changed after the EPO systems report before this one. Not tested without
// the "service mapped" column: it decides which of the two cards a difference belongs to.
(pack as record, run as record, config as record) as record =>
    let
        epo = run[Epo],
        pairs = List.Select(run[EpoComparison][Pairs], (pair) => pair[Mapped] = true),
        tested = fnEpoTested(pack, run, config, pairs),
        changedSince = (system as record) as logical => epo[PreviousDate] <> null and system[Changed] <> null and system[Changed] > epo[PreviousDate],
        changedWords = (system as record) as text => if system[Changed] = null then "" else " (last change in EPO: " & fnLongDate(system[Changed]) & ")",
        findings = List.Combine(List.Transform(pairs, (pair) => List.Transform(List.Select(pair[Differences], (difference) => not difference[Leftover]), (difference) =>
            fnFinding(pack, pair[Ci], difference[Field],
                difference[Label] & " is " & difference[Current] & " in ServiceNow, EPO has " & difference[Epo] & changedWords(pair[System]),
                [
                    Fix = [Change = difference[Label], Current = difference[Current], Set = difference[Epo] & ", from EPO"] & (if difference[Value] <> "" then [Value = difference[Value]] else []),
                    Chips = if changedSince(pair[System]) then {ReadingRules[epoChangedChip]} else {}
                ]))))
    in
        if not List.Contains(run[Columns], "serviceMapped") then fnEpoNoFlag()
        else [
            Findings = List.Buffer(findings), Tested = tested[Tested], Evaluated = tested[Evaluated],
            Notes = tested[Notes] & (if epo[PreviousDate] = null then {"The chip """ & ReadingRules[epoChangedChip] & """ needs an earlier EPO systems report: this is the first one loaded."} else {})
        ]
