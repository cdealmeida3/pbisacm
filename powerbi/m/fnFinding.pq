// One finding of a check on a CI (src/core/model/model.ts, Finding). The key never changes: <check>:<CI key>:<field>, and
// ":<suffix>" for a finding about one relationship. `extra` may give Suffix, Review (listed for a review, why), Wait
// (waits, why), Source (what the source says), Fix (the line of a SACM fix list: Change, Current, Set, Value, RelatedTo),
// Chips, ContactCi, InServiceNow, Mapping (the reasons of a case of the mapping backlog, by id), Group (the kind of
// problem a line is listed under: a problem of the contract data, a field of the upload check; D146) and Subject (the
// record a finding is about when it is not a CI of the report: a contract, fnContractSubject).
(pack as record, ci as record, field as text, detail as text, optional extra as nullable record) as record =>
    let
        more = if extra = null then [] else extra,
        suffix = Record.FieldOrDefault(more, "Suffix", "")
    in
        [
            Key = pack[id] & ":" & ci[Key] & ":" & field & (if suffix = "" then "" else ":" & suffix), CheckId = pack[id], CiKey = ci[Key], CiName = ci[Name],
            Class = ci[Class], Field = field, Severity = Record.FieldOrDefault(pack, "severity", ""), Detail = detail,
            Review = Record.FieldOrDefault(more, "Review", ""), Wait = Record.FieldOrDefault(more, "Wait", ""), Source = Record.FieldOrDefault(more, "Source", ""),
            Fix = Record.FieldOrDefault(more, "Fix", null), Chips = Record.FieldOrDefault(more, "Chips", {}), ContactCi = Record.FieldOrDefault(more, "ContactCi", ""),
            InServiceNow = Record.FieldOrDefault(more, "InServiceNow", false), Mapping = Record.FieldOrDefault(more, "Mapping", {}),
            Problem = Record.FieldOrDefault(more, "Group", ""), Subject = Record.FieldOrDefault(more, "Subject", null)
        ]
