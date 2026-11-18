// Table Reviews (D291): the marks of the lifecycle review in the list SACM Reviews (the tab Lifecycle of the Audit page,
// read-only until build B8): per review date and CI, what EPO says and the answer of the review.
let
    rows = Table.ToRecords(fnStateList("reviews")),
    words = [same = "Same in EPO", different = "Not the same as in EPO", #"not-in-epo" = "Not in EPO"],
    lines = List.Transform(rows, (row) => {
        if row[ReviewDate] = "" then null else Date.FromText(Text.Start(row[ReviewDate], 10), [Format = "yyyy-MM-dd", Culture = "en-US"]),
        row[CiKey], row[CiName], row[Class], row[StatusInEpo], row[Answer], Record.FieldOrDefault(words, row[Answer], row[Answer]), row[Note], row[By],
        if row[At] = "" then null else DateTime.FromText(row[At], [Format = "yyyy-MM-ddTHH:mm:ss", Culture = "en-US"])})
in
    #table(type table [ReviewDate = date, CiKey = text, CiName = text, Class = text, StatusInEpo = text, Answer = text, AnswerLabel = text, Note = text, By = text, At = datetime], lines)
