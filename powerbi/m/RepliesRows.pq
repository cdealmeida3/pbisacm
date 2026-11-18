// Table Replies (D291): every reply the shared mailbox filed in the list SACM Replies, newest first. Matched: a message of
// the journal has its reference, so the reply shows on that case.
let
    refs = fnKeySet(List.Transform(List.Select(JournalEvents, (event) => event[Type] = "message" and event[Ref] <> ""), (event) => event[Ref])),
    rows = List.Transform(ReplyItems, (reply) => {
        reply[Ref], reply[From], if reply[Received] = "" then null else DateTime.FromText(reply[Received], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"]),
        reply[Subject], reply[Body], Record.HasFields(refs, reply[Ref])})
in
    Table.Sort(#table(type table [Ref = text, From = text, Received = datetime, Subject = text, Body = text, Matched = logical], rows), {{"Received", Order.Descending}, {"Ref", Order.Ascending}})
