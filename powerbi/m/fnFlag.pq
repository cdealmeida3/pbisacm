// true / false from "true", "yes", "y", "1" / "false", "no", "n", "0" (any case); null for anything else. With strict,
// "y" and "n" do not count (the contract reports, src/core/sources/contracts/contract-reports.ts).
(value as text, optional strict as nullable logical) as nullable logical =>
    let
        text = Text.Lower(Text.Trim(value), "en-US"),
        yes = if strict = true then {"true", "yes", "1"} else {"true", "yes", "y", "1"},
        no = if strict = true then {"false", "no", "0"} else {"false", "no", "n", "0"}
    in
        if List.Contains(yes, text) then true else if List.Contains(no, text) then false else null
