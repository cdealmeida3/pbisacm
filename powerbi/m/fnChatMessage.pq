// The first message of a Teams chat (src/core/messages/messages.ts, chatMessage; D44, D163; build B7): the same first
// sentence and ask as the email, written for a chat ({reply} reads "answer in this chat"), with the names of the CIs that
// `to` (the address of the person asked) is asked about, at most eight and then "and 3 more CIs". With `to` "": every
// CI. `items`: the cases, each with its Fact; `settings`: MessageSettings; `ref`: the reference, or %%REF%% for the
// Power App to fill.
(items as list, settings as record, ref as text, to as text, optional checkPacks as nullable list) as text =>
    let
        chat = settings & [Channel = "chat"],
        lower = (value as text) as text => Text.Lower(value, "en-US"),
        theirs = if to = "" then items else List.Select(items, (item) => lower(fnRecipient(item[Fact], settings)[Email]) = lower(to)),
        own = if List.IsEmpty(theirs) then items else theirs,
        packs = if checkPacks <> null then checkPacks else List.Transform(Json.Document(CheckFiles), (file) => file[pack]),
        pack = if List.IsEmpty(own) then null else List.First(List.Select(packs, (candidate) => candidate[id] = own{0}[Fact][CheckId]), null),
        message = if pack = null then null else Record.FieldOrDefault(Record.FieldOrDefault(pack, "playbook", []), "message", null)
    in
        if message = null then "Hi, this is the SACM team. Reference: " & ref
        else
            let
                mine = List.Select(own, (item) => item[Fact][CheckId] = pack[id]),
                texts = fnMessageSection(message, mine{0}[Fact][Route], mine, chat),
                names = List.Sort(List.Distinct(List.Transform(mine, (item) => item[Fact][CiName])), Comparer.FromCulture("en-US")),
                more = List.Count(names) - 8,
                noun = if List.AllTrue(List.Transform(mine, (item) => Record.FieldOrDefault(item[Fact], "Contract", null) <> null)) then "more contract" else "more CI",
                shown = List.Transform(List.FirstN(names, 8), (name) => "- " & name) & (if more > 0 then {"- and " & Text.From(more) & " " & noun & (if more = 1 then "" else "s")} else {})
            in
                Text.Combine({"Hi, this is the SACM team. " & texts[Intro][Text]} & shown & {texts[Ask][Text], "Reference: " & ref}, "#(lf)")
