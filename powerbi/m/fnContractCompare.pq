// The two contract files matched (src/core/sources/contracts/contract-reports.ts, compareContracts): the Solusi contract
// number is the Vendor contract of ServiceNow. Worked out once per run, when a contract check reads it. `solusi` and
// `servicenow` are the files of fnPairedFile. Returns [Solusi, ServiceNow] (each [Contracts, Date, Report]), Pairs (each
// [Solusi, ServiceNow, Subject, Differences]), NotInSolusi (a Solusi number the Solusi file does not hold), NoNumber (no
// Solusi number: typed in by hand), NotInServiceNow (not imported yet) and ServiceNowOf (Solusi number in lower case ->
// the ServiceNow contract of its pair). Differences: the fields Solusi holds and ServiceNow shows differently
// (contract-detectors.ts, fieldDifferences); a field empty in Solusi is not one (that is the card "To clear by hand").
(solusi as record, servicenow as record, config as record) as record =>
    let
        lower = (value as text) as text => Text.Lower(value, "en-US"),
        solusiRows = List.Buffer(solusi[Rows]),
        servicenowRows = List.Buffer(servicenow[Rows]),
        // As a Map that is set contract after contract: the last contract of a number wins.
        grouped = fnGroupBy(solusiRows, (contract) => lower(contract[Number])),
        byNumber = Record.FromList(List.Transform(Record.FieldValues(grouped), List.Last), Record.FieldNames(grouped)),
        matched = List.Buffer(List.Transform(servicenowRows, (contract) =>
            let number = lower(contract[VendorContract]) in
            [ServiceNow = contract, Number = number, Solusi = if number = "" then null else Record.FieldOrDefault(byNumber, number, null)])),
        fields = List.Buffer(List.Transform(config[fields], (entry) => entry & [Column = fnPascal(entry[field])])),
        blank = (value as any) as logical => value = null or value = "",
        differences = (pair as record) as list =>
            List.Transform(List.Select(fields, (entry) =>
                let
                    one = Record.Field(pair[Solusi], entry[Column]),
                    other = Record.Field(pair[ServiceNow], entry[Column])
                in
                    not blank(one) and not (if entry[kind] = "date" then one = other else fnNameKey(one, "") = fnNameKey(if other = null then "" else other, ""))),
                (entry) => [Field = entry[field], Label = entry[label], Kind = entry[kind],
                    Solusi = Record.Field(pair[Solusi], entry[Column]), ServiceNow = Record.Field(pair[ServiceNow], entry[Column])]),
        pairs = List.Buffer(List.Transform(List.Select(matched, (item) => item[Solusi] <> null), (item) =>
            let pair = [Solusi = item[Solusi], ServiceNow = item[ServiceNow]] in
            pair & [Subject = fnContractSubject(item[ServiceNow], item[Solusi]), Differences = List.Buffer(differences(pair))])),
        seen = fnKeySet(List.Transform(List.Select(matched, (item) => item[Solusi] <> null), (item) => item[Number])),
        // The ServiceNow contract of each paired Solusi number (the last pair of a number wins, as a Map).
        pairsByNumber = fnGroupBy(pairs, (pair) => lower(pair[Solusi][Number]))
    in
        [
            Solusi = [Contracts = solusiRows, Date = solusi[ReportDate], Report = solusi[FileName]],
            ServiceNow = [Contracts = servicenowRows, Date = servicenow[ReportDate], Report = servicenow[FileName]],
            Pairs = pairs,
            NotInSolusi = List.Buffer(List.Transform(List.Select(matched, (item) => item[Number] <> "" and item[Solusi] = null), (item) => item[ServiceNow])),
            NoNumber = List.Buffer(List.Transform(List.Select(matched, (item) => item[Number] = ""), (item) => item[ServiceNow])),
            NotInServiceNow = List.Buffer(List.Select(solusiRows, (contract) => not Record.HasFields(seen, lower(contract[Number])))),
            ServiceNowOf = Record.FromList(List.Transform(Record.FieldValues(pairsByNumber), (list) => List.Last(list)[ServiceNow]), Record.FieldNames(pairsByNumber))
        ]
