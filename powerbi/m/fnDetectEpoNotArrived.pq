// EPO update not arrived (code detector epo/not-arrived, src/core/checks/detectors/epo-detectors.ts): a CI that is not
// service mapped differs from its EPO system, so the sync did not bring the change. A review list. A change in EPO
// younger than `waitDays` days before the report waits: the sync may still bring it. A leftover is on neither EPO card
// (D190). The note names the EPO systems that are not Retired and match no Service Instance.
(pack as record, run as record, config as record) as record =>
    let
        epo = run[Epo],
        date = run[Date],
        comparison = run[EpoComparison],
        pairs = List.Select(comparison[Pairs], (pair) => pair[Mapped] = false),
        tested = fnEpoTested(pack, run, config, pairs),
        changedSince = (system as record) as logical => epo[PreviousDate] <> null and system[Changed] <> null and system[Changed] > epo[PreviousDate],
        changedWords = (system as record) as text => if system[Changed] = null then "" else " (last change in EPO: " & fnLongDate(system[Changed]) & ")",
        waitOf = (system as record) as text =>
            let age = if system[Changed] <> null and date <> null then Duration.Days(date - system[Changed]) else null in
            if age = null or age >= config[waitDays] then ""
            else "Changed in EPO " & (if age <= 0 then "on the day of the report" else Text.From(age) & " day" & (if age = 1 then "" else "s") & " before the report") & ": the sync may still bring it",
        findings = List.Combine(List.Transform(pairs, (pair) => List.Transform(List.Select(pair[Differences], (difference) => not difference[Leftover]), (difference) =>
            fnFinding(pack, pair[Ci], difference[Field],
                difference[Label] & " is " & difference[Current] & " in ServiceNow, EPO has " & difference[Epo] & changedWords(pair[System]),
                [Chips = if changedSince(pair[System]) then {ReadingRules[epoChangedChip]} else {}, Wait = waitOf(pair[System])])))),
        without = comparison[WithoutCi],
        count = List.Count(without),
        shown = Text.Combine(List.Transform(List.FirstN(without, 10), (system) => system[Name] & " (" & system[EpoId] & ")"), ", ")
    in
        if not List.Contains(run[Columns], "serviceMapped") then fnEpoNoFlag()
        else [
            Findings = List.Buffer(findings), Tested = tested[Tested], Evaluated = tested[Evaluated],
            Notes = tested[Notes] & (if count = 0 then {} else {fnPlural(count, "EPO system") & " that "
                & (if count = 1 then "is not Retired has no Service Instance with its" else "are not Retired have no Service Instance with their")
                & " EPO ID: " & shown & (if count > 10 then ", …" else "") & "."})
        ]
