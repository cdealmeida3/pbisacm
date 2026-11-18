// A field name as a column name of the model: owned_by -> OwnedBy, manager.email -> ManagerEmail (tools/powerbi/generate.ts, pascal).
(name as text) as text =>
    Text.Combine(List.Transform(List.Select(Text.SplitAny(name, "._"), (part) => part <> ""), (part) => Text.Upper(Text.Start(part, 1), "en-US") & Text.Middle(part, 1)))
