// Table HistoryExpected (the Self-check page, D293): what the HTML app counts on the samples over the two report dates and
// the team's state (ExpectedHistory, generated). The measure History found gives the same count from the model.
let
    items = Json.Document(ExpectedHistory)
in
    #table(type table [Metric = text, Expected = Int64.Type, Order = Int64.Type],
        List.Transform(List.Positions(items), (at) => {items{at}[metric], items{at}[expected], at + 1}))
