// The replies of the list SACM Replies (D291): one record per reply, with the reference of the message it answers (Ref,
// the column Title), who sent it, when it arrived (yyyy-MM-ddTHH:mm:ss), its subject and its text.
List.Buffer(List.Transform(Table.ToRecords(fnStateList("replies")), (row) => [Ref = row[Title], From = row[From], Received = row[Received], Subject = row[Subject], Body = row[Body]]))
