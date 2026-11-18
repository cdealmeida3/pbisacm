// The place of the first header that is one of `names` (with `suffix`: that ends with one of them); -1 when none.
(headers as list, names as list, optional suffix as nullable logical) as number =>
    List.PositionOf(
        List.Transform(headers, (header) =>
            if suffix = true then List.AnyTrue(List.Transform(names, (name) => Text.EndsWith(header, name))) else List.Contains(names, header)),
        true)
