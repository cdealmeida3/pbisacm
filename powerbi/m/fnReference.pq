// A reference file by the name a check file gives it ("reference/criticality"); null when it is not there.
(name as nullable text) as any =>
    if name = null or not Text.StartsWith(name, "reference/") then null
    else Record.FieldOrDefault(ReferenceFiles, Text.Middle(name, 10), null)
