// "the CI below", "the CIs below", "the contract below" (src/core/messages/messages.ts, belowWords; build B7). `items`:
// the cases of a message or of one of its parts (fnDrafts), each with its Fact.
(items as list) as text =>
    let
        count = List.Count(List.Distinct(List.Transform(items, (item) => item[Fact][CiKey]))),
        noun = if List.AllTrue(List.Transform(items, (item) => Record.FieldOrDefault(item[Fact], "Contract", null) <> null)) then "contract" else "CI"
    in
        "the " & noun & (if count = 1 then "" else "s") & " below"
