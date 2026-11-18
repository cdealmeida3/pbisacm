// The small words of the contract checks (src/core/sources/contracts/contract-reports.ts and contract-detectors.ts),
// SameWord (two texts the same without case and extra spaces), InList (a text is one of a list, the same way), Blank (no
// value), Shown (a value as a message writes it: a date as "12 November 2026"), StatusTag (the first status tag of a
// ServiceNow contract, "S - Concluded", or "") and TargetTag (the first tag that sets the criticality by hand, or "").
[
    SameWord = (a as nullable text, b as nullable text) as logical => fnNameKey(if a = null then "" else a, "") = fnNameKey(if b = null then "" else b, ""),
    InList = (list as list, value as nullable text) as logical => let key = fnNameKey(if value = null then "" else value, "") in
        List.AnyTrue(List.Transform(list, (entry) => fnNameKey(entry, "") = key)),
    Blank = (value as any) as logical => value = null or value = "",
    Shown = (value as any) as text => if value = null then "" else if value is date then fnLongDate(value) else value,
    TagList = (contract as record) as list => if contract[Tags] = "" then {} else Text.Split(contract[Tags], ", "),
    FirstTag = (contract as record, pattern as text) as text =>
        List.First(List.Select(TagList(contract), (tag) => fnMatches(pattern, "i", tag)), ""),
    StatusTag = (contract as record, config as record) as text => FirstTag(contract, config[statusTag]),
    TargetTag = (contract as record, config as record) as text => FirstTag(contract, config[targetTag])
]
