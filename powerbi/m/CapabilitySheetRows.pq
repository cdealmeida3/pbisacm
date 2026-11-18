// Table CapabilitySheet (src/core/mapping/capability-sheet.ts, D205): every Business Capability of the newest CI report
// with its status, the capabilities above and below it, the Business Processes below, its description, tags, people and
// hidden characters, sorted by name. For the talks with Enterprise Architecture and Process Management: the table's
// Export data gives the file. Empty without a Relationship report (the page says so).
let
    run = CheckRun,
    graph = if run = null then null else run[Graph],
    columns = if run = null then {} else run[Columns],
    culture = Comparer.FromCulture("en-US"),
    namesOf = (nodes as list) as text => Text.Combine(List.Sort(List.Distinct(List.Transform(nodes, (node) => node[Name])), culture), ", "),
    linked = (ci as record, direction as text, cls as text) as list =>
        let edges = Record.FieldOrDefault(if direction = "up" then graph[Up] else graph[Down], ci[Key], {}) in
        List.Select(List.Transform(edges, (edge) => if direction = "up" then edge[Parent] else edge[Child]), (other) => other[Cls] = cls),
    personOf = (ci as record, role as text) as text =>
        let person = fnPerson(ci, role, columns), shown = if person = null then "" else if person[Name] <> "" then person[Name] else person[Email] in
        if shown = "" then "" else shown & (if person[Active] = false then " (inactive)" else ""),
    capabilities = if graph = null then {} else List.Select(run[Cis], (ci) => ci[Class] = "business_capability"),
    sorted = List.Sort(capabilities, (a, b) => let byName = culture(a[Name], b[Name]) in if byName <> 0 then byName else culture(a[Key], b[Key])),
    row = (position as number) as list =>
        let ci = sorted{position} in
        {
            ci[Name], ci[Status], namesOf(linked(ci, "up", "business_capability")), namesOf(linked(ci, "down", "business_capability")),
            namesOf(linked(ci, "down", "business_process")), ci[Description], Text.Combine(ci[TagList], ", "), personOf(ci, "owned_by"), personOf(ci, "managed_by"),
            Text.Combine(ci[HiddenCharacters], ", "), position + 1
        }
in
    #table(
        type table [Name = text, Status = text, CapabilitiesAbove = text, CapabilitiesBelow = text, ProcessesBelow = text, Description = text, Tags = text,
            OwnedBy = text, ManagedBy = text, HiddenCharacters = text, Order = Int64.Type],
        List.Transform(List.Positions(sorted), row))
