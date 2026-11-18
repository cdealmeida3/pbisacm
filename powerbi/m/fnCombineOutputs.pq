// The outputs of the parts of a detector as one output: [Findings, Tested, Evaluated, Notes], each a list.
(outputs as list) as record =>
    [
        Findings = List.Buffer(List.Combine(List.Transform(outputs, (out) => out[Findings]))),
        Tested = List.Combine(List.Transform(outputs, (out) => out[Tested])),
        Evaluated = List.Combine(List.Transform(outputs, (out) => out[Evaluated])),
        Notes = List.Combine(List.Transform(outputs, (out) => out[Notes]))
    ]
