// The part AppEmail of the table Run (build R6, D372): the rows the Power App "SACM messages" gets, for the one email
// chosen on the page Messages (its visual filter: AppEmail[Selected email] is 1). One row per draft (Piece 0) with the
// fields the app reads, and each email's Html and Csv cut into pieces of PieceSize characters (Piece 1, 2, …, on the
// email's first part): the Power Apps visual is reported to cut a text of about 32,000 characters, and an email of a
// person with many kinds of problem passes that (66,000 characters at real size, its file 290,000). The app joins the
// pieces in order and checks the length against HtmlLength and CsvLength. Row is unique, so the visual never joins two
// rows. `drafts` is the part Drafts (fnDraftsPart).
(drafts as table) as table =>
    let
        pieceSize = 20000,
        rows = List.Buffer(Table.ToRecords(drafts)),
        partRow = (draft as record) as list =>
            {
                draft[DraftId], draft[DraftId], draft[EmailId], 0, draft[Ref], draft[Kind], draft[KindLabel], draft[To], draft[ToName],
                draft[Cc], draft[Subject], draft[Chat], draft[Keys], draft[NewKeys], draft[FreeKeys], draft[CiCount], draft[About],
                draft[NobodyAbove], draft[Mailbox], draft[AssignedTo], draft[Summary], draft[EmailSubject],
                Text.Length(draft[Html]), Text.Length(draft[Csv]), draft[AddressWhy], "", ""
            },
        // The pieces of the email of a first part: at least one, so an email always has its Html in the app.
        pieceRows = (draft as record) as list =>
            let
                html = draft[Html],
                csv = draft[Csv],
                count = List.Max({1, Number.RoundUp(Text.Length(html) / pieceSize), Number.RoundUp(Text.Length(csv) / pieceSize)})
            in
                List.Transform({1..count}, (piece) =>
                    {
                        draft[DraftId] & "-" & Text.From(piece), draft[DraftId], draft[EmailId], piece, "", "", "", "", "",
                        "", "", "", "", "", "", 0, "",
                        false, false, "", "", "",
                        0, 0, "",
                        Text.Middle(html, (piece - 1) * pieceSize, pieceSize), Text.Middle(csv, (piece - 1) * pieceSize, pieceSize)
                    }),
        parts = List.Transform(rows, partRow),
        pieces = List.Combine(List.Transform(List.Select(rows, (draft) => draft[DraftId] = draft[EmailId]), pieceRows))
    in
        #table(
            type table [Row = text, DraftId = text, EmailId = text, Piece = Int64.Type, Ref = text, Kind = text, KindLabel = text, To = text,
                ToName = text, Cc = text, Subject = text, Chat = text, Keys = text, NewKeys = text, FreeKeys = text, CiCount = Int64.Type,
                About = text, NobodyAbove = logical, Mailbox = logical, AssignedTo = text, Summary = text, EmailSubject = text,
                HtmlLength = Int64.Type, CsvLength = Int64.Type, AddressWhy = text, Html = text, Csv = text],
            parts & pieces)
