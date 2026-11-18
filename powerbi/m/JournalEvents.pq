// The events of the list SACM Journal (D291), as the app reads its journal (DATA-MODEL §3): one record per row, oldest
// first (by At, then by id), every field as text ("" when empty). By is lower case; Keys is the list of the finding
// keys of the event, one per line of the column Keys. Read by the tables Journal, JournalKeys and Activity, and by the
// parts CaseLines and Exceptions of the table Run.
let
    rows = Table.ToRecords(fnStateList("journal")),
    events = List.Transform(rows, (row) => [
        Id = row[Title], At = row[At], By = Text.Lower(row[By], "en-US"), ByName = row[ByName], Type = row[Type],
        Keys = List.Select(List.Transform(Text.SplitAny(row[Keys], "#(cr)#(lf)"), Text.Trim), (key) => key <> ""),
        Text = row[Text], Ref = row[Ref], To = row[To], Cc = row[Cc], Subject = row[Subject], Kind = row[Kind], Channel = row[Channel],
        Person = row[Person], Reason = row[Reason], ReviewOn = row[ReviewOn], RetireOn = row[RetireOn], CheckId = row[CheckId], CiKey = row[CiKey], CiName = row[CiName],
        // The sample of a lifecycle review, on the row that starts it (build B8, D306; LifecycleReviews).
        Items = row[Items]
    ]),
    order = (a as record, b as record) as number => let first = Value.Compare(a[At], b[At]) in if first <> 0 then first else Value.Compare(a[Id], b[Id])
in
    List.Buffer(List.Sort(events, order))
