// What the cases of each check offer (build B6, D294), by check id: the kind of its card page (src/app/view/cards.ts,
// cardKind; plan §6.1) and the words and marks of its playbook that change the actions of the Power App: askAfterReview
// (a line to check that SACM can hand to the owner), askWhenUnsure (a fix list line SACM cannot fix alone), markWord
// ("deleted": the line is marked deleted, not fixed) and retirementDate (the owner can give a planned retirement date).
let
    packs = List.Transform(Json.Document(CheckFiles), (file) => file[pack]),
    entry = (pack as record) as record =>
        let
            playbook = Record.FieldOrDefault(pack, "playbook", []),
            kind = if List.Contains(Record.FieldOrDefault(playbook, "audience", {}), "procurement") then "mailbox"
                else if Record.FieldOrDefault(playbook, "path", "") = "mapping" then "mapping"
                else if Record.FieldOrDefault(pack, "reviewOnly", false) = true then "review"
                else if Record.FieldOrDefault(playbook, "path", "") = "sacm-fix" then "fix"
                else "owners"
        in
            [
                Kind = kind, AskAfterReview = Record.FieldOrDefault(playbook, "askAfterReview", ""), AskWhenUnsure = Record.FieldOrDefault(playbook, "askWhenUnsure", ""),
                MarkWord = Record.FieldOrDefault(playbook, "markWord", "fixed"), RetirementDate = Record.FieldOrDefault(playbook, "retirementDate", false) = true
            ]
in
    Record.FromList(List.Transform(packs, entry), List.Transform(packs, (pack) => pack[id]))
