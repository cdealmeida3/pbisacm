// The column of the model for each criticality name of the check files ("target.availability" -> TargetAvailability),
// made once, so fnLevelAt only looks a name up.
let
    names = List.Combine(List.Transform({"target", "inherited"}, (kind) => List.Transform(ReadingRules[dimensions], (dimension) => kind & "." & dimension)))
in
    Record.FromList(List.Transform(names, fnPascal), names)
