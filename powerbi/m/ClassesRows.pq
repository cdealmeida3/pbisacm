// Table Classes: the nine logical classes, their names in words and their order.
let
    classes = ReadingRules[classes]
in
    #table(type table [Id = text, Label = text, Order = Int64.Type],
        List.Transform(List.Positions(classes), (position) => {classes{position}[id], classes{position}[label], position + 1}))
