// The column prefix of the model for each role of the CI report (owned_by -> OwnedBy), made once, so fnPerson only looks
// a role up.
Record.FromList(List.Transform(ReadingRules[roles], fnPascal), ReadingRules[roles])
